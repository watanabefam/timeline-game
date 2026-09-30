/* offline.js — installability affordance and offline (service worker) wiring.
 *
 * → window.Offline
 *
 * Two responsibilities, matching the two shippable slices:
 *
 *   S1a — installability. The web app manifest alone makes the game
 *         installable; this file only adds the *suggestion* to install, and
 *         only when the browser says it is installable (`beforeinstallprompt`).
 *         iOS has no such event by design, so nothing is shown there — never a
 *         dead button (see GAMIFICATION_BRIEF-style age-band rule: an install
 *         prompt is never shown over a game).
 *
 *   S1b — offline. Registers the service worker and keeps it honest. The
 *         worker's *URL* carries the offline manifest's content hash, so a
 *         changed asset set is a changed script URL and the browser runs its
 *         native update lifecycle. The hash is derived by
 *         scripts/gen-offline-manifest.mjs — never hand-typed, because a
 *         hand-typed revision stops matching the files it describes (this is
 *         the lesson of the ?v=N bug and of the stale narration clip).
 *
 * Why the page probes the manifest on every load: offline-manifest.js is what
 * the *worker* precaches from, but the worker only re-evaluates when its script
 * changes. The page is the only actor that can observe a new deployment while
 * an old worker is still installed, so it fetches offline-manifest.json
 * (network-only — the worker is told never to serve it from cache) and
 * registers `sw.js?v=<hash>` when the hash has moved.
 *
 * A new worker is never activated while a game is in progress: it waits, and is
 * applied when the game screen is hidden. That is the whole of the "updated
 * without interrupting play" rule.
 *
 * Nothing here runs under file:// (no service worker, no fetch) or inside a
 * native shell, where the worker is mandatory to exclude
 * (doc/CROSS_PLATFORM_ROADMAP.md §5.1).
 */
(function () {
  "use strict";

  var LS_DISMISSED = "timeline.install.dismissed.v1";
  var LS_REV = "timeline.offline.rev.v1";
  var LS_READY = "timeline.offline.ready.v1";
  var LS_MISSING = "timeline.offline.missing.v1";
  var LS_PERSIST = "timeline.offline.persist.v1";
  var LS_APPLIED = "timeline.offline.applied.v1";
  var LS_MANIFEST = "timeline.offline.manifest.v1";

  function $(id) { return document.getElementById(id); }
  function readLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function writeLS(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function dropLS(k) { try { localStorage.removeItem(k); } catch (e) {} }

  // ---------------------------------------------------------------------------
  // S1a — install suggestion
  // ---------------------------------------------------------------------------

  var deferredPrompt = null;

  function installed() {
    try {
      return window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches ||
        window.navigator.standalone === true;
    } catch (e) { return false; }
  }

  function showInstallBar() {
    var bar = $("install-bar");
    if (!bar) return;
    if (!deferredPrompt || installed() || readLS(LS_DISMISSED) === "1") return;
    bar.classList.remove("hidden");
  }

  function hideInstallBar() {
    var bar = $("install-bar");
    if (bar) bar.classList.add("hidden");
  }

  function wireInstall() {
    window.addEventListener("beforeinstallprompt", function (e) {
      // Keep the event so the click can trigger it later.
      e.preventDefault();
      deferredPrompt = e;
      showInstallBar();
    });

    window.addEventListener("appinstalled", function () {
      deferredPrompt = null;
      hideInstallBar();
    });

    var btn = $("install-btn");
    if (btn) {
      btn.addEventListener("click", function () {
        if (!deferredPrompt) { hideInstallBar(); return; }
        var p = deferredPrompt;
        deferredPrompt = null;
        hideInstallBar();
        try { p.prompt(); } catch (e) {}
      });
    }

    var no = $("install-dismiss");
    if (no) {
      no.addEventListener("click", function () {
        writeLS(LS_DISMISSED, "1");
        hideInstallBar();
      });
    }

    // A dismissal is per-device, not forever: the browser fires
    // beforeinstallprompt again on a later visit, and we only refuse to show
    // while the stored flag is set. `?resetinstall=1` clears it for support.
    try {
      if (new URLSearchParams(location.search).get("resetinstall") === "1") dropLS(LS_DISMISSED);
    } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  // S1b — service worker + persistence
  // ---------------------------------------------------------------------------

  // `!!navigator.serviceWorker`, not `"serviceWorker" in navigator`: the point
  // is a *usable* worker registry. A context that exposes the property but no
  // implementation (the shape some in-app WebViews and old engines have) would
  // pass an `in` check and then throw on `register` — a broken Settings line
  // instead of an honest one.
  var supported = !!navigator.serviceWorker && location.protocol !== "file:";
  var manifest = null;      // last probed offline manifest ({ hash, files, totalBytes })
  var probeFailed = false;  // the last probe could not reach the server
  var reloading = false;

  function inShell() {
    return !!(window.__TAURI__ || window.Capacitor) ||
      location.protocol === "capacitor:" || location.protocol === "ionic:";
  }

  function onGameScreen() {
    var g = $("game");
    // timeline.js swaps screens by toggling `.hidden` (see `show()` there).
    return !!g && !g.classList.contains("hidden");
  }

  function fmtBytes(n) {
    if (!n && n !== 0) return "";
    var mb = n / (1024 * 1024);
    return mb >= 10 ? Math.round(mb) + " MB" : mb.toFixed(1) + " MB";
  }

  // The manifest the last successful probe saw. The probe is network-only by
  // design (a cached copy would let an old worker look current), so without a
  // remembered copy a page loaded with no network cannot say whether the game
  // is stored — it told the player "checking…" forever while a complete cache
  // sat right there. Found by the WebKit smoke, which reads the status line
  // after an offline reload.
  //
  // It is not a second source of truth: it is only consulted when the network
  // cannot answer, and the generation it names is the one the installed worker
  // also holds, so the page can never disagree with the worker serving it.
  function storedManifest() {
    var raw = readLS(LS_MANIFEST);
    if (!raw) return null;
    try {
      var m = JSON.parse(raw);
      return m && m.hash && m.files && m.files.length ? m : null;
    } catch (e) { return null; }
  }

  function statusLine() {
    if (location.protocol === "file:") {
      return "Offline play needs the hosted site — it cannot work over file://.";
    }
    if (inShell()) return "This app handles offline play itself.";
    if (!supported) return "This browser cannot store the game for offline play.";

    var persist = readLS(LS_PERSIST);
    var storage = persist === "granted" ? "durable" :
      persist === "denied" ? "best-effort (the browser may reclaim it)" : "";

    if (!manifest) {
      return navigator.onLine === false
        ? "Offline copies: not set up yet — connect once while online."
        : "Offline copies: checking…";
    }
    var total = manifest.files ? manifest.files.length : 0;
    var ready = readLS(LS_READY) === manifest.hash;
    var missing = 0;
    var m = readLS(LS_MISSING);
    if (m && m.indexOf(manifest.hash + ":") === 0) missing = parseInt(m.slice(manifest.hash.length + 1), 10) || 0;

    // "Ready" means the cache was inspected and holds this generation. With
    // nothing stored yet the honest word is *downloading* — not "ready" (no
    // offline) and not "unavailable" (the worker is filling it right now).
    if (!ready || missing >= total) {
      // With no way to reach the server, nothing is downloading: the honest
      // instruction is "connect once", not a progress claim that will never
      // finish. (Also reached with `onLine` still true, e.g. a dead server or a
      // captive portal — hence the flag as well as the flag's absence.)
      if (probeFailed || navigator.onLine === false) {
        return total - missing > 0
          ? "Offline copies: incomplete — " + (total - missing) + " of " + total +
            " files are stored. Connect once and they will finish."
          : "Offline copies are not stored on this device yet — connect once to download them.";
      }
      return total
        ? "Offline copies: downloading in the background (" + total + " files)."
        : "Offline copies: not set up yet — connect once while online.";
    }
    var files = total - missing;
    return "Offline play ready — " + files + " files, " + fmtBytes(manifest.totalBytes) +
      (missing ? " · " + missing + " could not be saved" : "") +
      (storage ? " · storage " + storage : "") + ".";
  }

  function updateStatus() {
    var el = $("offline-status");
    if (el) el.textContent = statusLine();
  }

  // Ask the cache itself whether this generation is complete, rather than
  // trusting a flag. Two reasons: the PRECACHED message can be missed (the
  // reload that applies an update can beat it), and storage can be reclaimed
  // later — in which case the honest answer is a smaller number, not "ready".
  function verifyReady() {
    if (!manifest || !manifest.cacheName || !window.caches) return;
    var base = location.href;
    var keys = manifest.files.map(function (f) {
      return new URL(f.path + "?__rev=" + f.rev, base).href;
    });
    caches.open(manifest.cacheName)
      .then(function (cache) { return Promise.all(keys.map(function (k) { return cache.match(k); })); })
      .then(function (hits) {
        var missing = hits.filter(function (h) { return !h; }).length;
        writeLS(LS_READY, manifest.hash);
        writeLS(LS_MISSING, manifest.hash + ":" + missing);
        updateStatus();
      })
      .catch(function () {});
  }

  function probe() {
    // Network-only: the worker is told to pass this through untouched, so a
    // cached copy can never make an old worker look current.
    return fetch("offline-manifest.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (m) {
        manifest = m && m.hash && m.files ? m : null;
        probeFailed = !manifest;
        if (manifest) { try { writeLS(LS_MANIFEST, JSON.stringify(manifest)); } catch (e) {} }
        return manifest;
      })
      .catch(function () { probeFailed = true; return null; });
  }

  var updateRetries = 0;

  // Applying the update means taking control AND showing the new build. Skipping
  // the reload was a real bug: the worker would activate, the cache would prune
  // to the new generation, and the player would keep running the old JavaScript
  // for the rest of the session while the status line claimed the new build was
  // ready. So: ask the waiting worker to take over, then reload exactly once.
  function applyWhenSafe(reg) {
    if (!reg || !reg.waiting) return;
    // A FIRST install is not an update. Chrome reports the freshly installed
    // worker as `waiting` for a moment even when there is no previous worker,
    // and treating that as an update reloaded the page under a first-time
    // visitor mid-download (found by the browser smoke, not by reasoning).
    // Only a page that is already controlled is looking at a replacement.
    //
    // The controller is attached a moment AFTER a page's scripts start, so a
    // freshly opened tab can see the waiting worker while `controller` is still
    // null. Bailing out for good there would leave the update waiting forever
    // (and the old generation's files un-pruned) — so retry, bounded, rather
    // than poll.
    if (!navigator.serviceWorker.controller) {
      if (updateRetries++ < 3) setTimeout(function () { applyWhenSafe(reg); }, 1000);
      return;
    }
    if (onGameScreen()) return;   // finish the game first; the worker keeps waiting
    if (reloading) return;
    reloading = true;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      // One reload per generation, so a slow activate cannot loop.
      var gen = manifest ? manifest.hash : "";
      if (readLS(LS_APPLIED) === gen) return;
      writeLS(LS_APPLIED, gen);
      location.reload();
    });
    try { reg.waiting.postMessage({ type: "SKIP_WAITING" }); } catch (e) { reloading = false; }
  }

  function watchMessages() {
    if (!navigator.serviceWorker || !navigator.serviceWorker.addEventListener) return;
    navigator.serviceWorker.addEventListener("message", function (e) {
      var d = e.data || {};
      if (d.type !== "PRECACHED") return;
      // Only the generation we probed for counts; a message from an older
      // worker must not mark the current one ready.
      if (!manifest || d.hash !== manifest.hash) { updateStatus(); return; }
      writeLS(LS_READY, d.hash);
      writeLS(LS_MISSING, d.hash + ":" + ((d.failed && d.failed.length) || 0));
      updateStatus();
      verifyReady();
    });
  }

  function watch(reg) {
    if (!reg) return;
    applyWhenSafe(reg);
    reg.addEventListener("updatefound", function () {
      var sw = reg.installing;
      if (!sw) return;
      sw.addEventListener("statechange", function () {
        if (sw.state === "installed") applyWhenSafe(reg);
      });
    });
    // Re-check whenever the page comes back or the game screen is left, which
    // is exactly when interrupting is no longer possible.
    document.addEventListener("visibilitychange", function () { applyWhenSafe(reg); });
    var g = $("game");
    if (g && window.MutationObserver) {
      new MutationObserver(function () { applyWhenSafe(reg); })
        .observe(g, { attributes: true, attributeFilter: ["class"] });
    }
  }

  function registerOnce() {
    if (!supported || inShell()) { updateStatus(); return; }
    probe().then(function (m) {
      // A failed probe must not erase what we already know: the installed
      // worker is still the last generation we saw, and that is what is stored.
      // Assign back to `manifest` — statusLine reads the module state, and
      // setting only the local left the line on "checking…" (the bug the
      // WebKit smoke caught, twice).
      if (!m) { m = storedManifest(); manifest = m; }
      updateStatus();
      if (!m) return;   // nothing deployed yet, and nothing remembered — keep the old worker
      verifyReady();
      var url = "sw.js?v=" + m.hash;
      var known = readLS(LS_REV);
      if (known === m.hash) {
        // Same generation: still ask for the registration so a fresh install
        // (or a cleared worker) is recovered without waiting for a new build.
        navigator.serviceWorker.register(url).then(watch, function () {}).then(updateStatus);
        return;
      }        navigator.serviceWorker.register(url).then(function (reg) {
        writeLS(LS_REV, m.hash);
        updateStatus();
        watch(reg);
      }, function () { updateStatus(); });
    });
  }

  function requestPersistence() {
    if (!supported || !navigator.storage || !navigator.storage.persist) {
      updateStatus();
      return;
    }
    if (readLS(LS_PERSIST)) { updateStatus(); return; }
    // Ask after the user has actually engaged, which is also when Chrome and
    // WebKit are most likely to grant it (an installed web app is one of
    // WebKit's heuristics). A refusal is a normal outcome, not an error.
    navigator.storage.persist().then(function (granted) {
      writeLS(LS_PERSIST, granted ? "granted" : "denied");
      updateStatus();
    }, function () { updateStatus(); });
  }

  function clearOffline() {
    var jobs = [];
    try {
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
        return Promise.all(regs.map(function (r) { return r.unregister(); }));
      }).catch(function () {}));
    } catch (e) {}
    try {
      jobs.push(caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }).catch(function () {}));
    } catch (e) {}
    dropLS(LS_REV);
    dropLS(LS_READY);
    dropLS(LS_MISSING);
    dropLS(LS_APPLIED);
    dropLS(LS_MANIFEST);
    Promise.all(jobs).then(function () { location.reload(); }, function () { location.reload(); });
  }

  // ---------------------------------------------------------------------------
  // public API + boot
  // ---------------------------------------------------------------------------

  window.Offline = {
    status: statusLine,
    clear: clearOffline,
    manifest: function () { return manifest; },
    isSupported: function () { return supported && !inShell(); },
  };

  function boot() {
    wireInstall();
    watchMessages();
    updateStatus();

    var clear = $("offline-clear");
    if (clear) clear.addEventListener("click", clearOffline);

    // One gesture is enough: storage and service workers both prefer to be
    // asked for after the user has interacted.
    var once = function () {
      document.removeEventListener("pointerdown", once);
      document.removeEventListener("keydown", once);
      requestPersistence();
    };
    document.addEventListener("pointerdown", once);
    document.addEventListener("keydown", once);

    // Keep registration off the critical path (first paint is not delayed).
    var run = function () {
      if (window.requestIdleCallback) window.requestIdleCallback(registerOnce);
      else setTimeout(registerOnce, 0);
    };
    if (document.readyState === "complete") run();
    else window.addEventListener("load", run);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
