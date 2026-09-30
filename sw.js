/* sw.js — offline service worker for the timeline game.
 *
 * Classic (non-module) worker, hand-written, no build step, no dependency.
 * Registered by offline.js as `sw.js?v=<offline-manifest hash>`, so a changed
 * asset set is a changed script URL and the browser's normal update lifecycle
 * does the work. The list itself is GENERATED (scripts/gen-offline-manifest.mjs)
 * and loaded below with importScripts(); it is never hand-edited.
 *
 * Two rules shape everything here:
 *
 *  1. Never serve a stale byte. `?v=N` exists because returning players were
 *     served stale code once already. So cache keys are CONTENT-ADDRESSED —
 *     `path?__rev=<sha256 of the file>` — for every entry. A file whose bytes
 *     change gets a new key and is re-fetched; a file that did not change keeps
 *     its key and is not re-downloaded. That is also why a narration clip
 *     re-rendered at the same path cannot go on being served stale: its
 *     revision moves, so its key moves, so does the manifest hash, so the
 *     worker is replaced.
 *
 *  2. Never mix generations in one page. Because every key carries its
 *     revision, two generations coexist in the single cache during an update,
 *     and cleanup only runs in `activate` — after the new generation's files
 *     (including the HTML shell) are already stored. A page is therefore always
 *     served the assets its own HTML names.
 *
 * The incoming request's `cache` mode is never forwarded: the app fetches deck
 * JSON with `cache: "no-cache"` and audio with `cache: "force-cache"`, and
 * forwarding either would break offline (no-cache forces revalidation).
 *
 * The worker is excluded from native shells by the registration guard in
 * offline.js (roadmap §5.1) — it must never be registered on capacitor://,
 * where it cannot work, or over a shell's bundled assets, which it would fail
 * to update.
 */

(function () {
  "use strict";

  var VERSION = "";
  try { VERSION = new URL(self.location.href).searchParams.get("v") || ""; } catch (e) {}

  // Synchronous, at evaluation time: the precache list is a classic script.
  importScripts("offline-manifest.js?v=" + VERSION);

  var MANIFEST = self.OFFLINE_MANIFEST || { hash: "", files: [], cacheName: "timeline-offline" };
  // Read from the generated manifest, not hardcoded: the page verifies cache
  // completeness against the same name (offline.js verifyReady).
  var CACHE = MANIFEST.cacheName || "timeline-offline";

  // Network-only paths: the page probes the manifest on every load to decide
  // whether a new generation exists. Serving it from cache would make an old
  // worker look current, which is precisely the bug this design avoids.
  var NETWORK_ONLY = ["/offline-manifest.json", "/offline-manifest.js"];

  var CONCURRENCY = 6;

  var OFFLINE_HTML =
    "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\" />" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />" +
    "<title>Timeline Game — offline</title><style>" +
    "html,body{margin:0;height:100%;background:#0a0e1a;color:#e7ecf3;" +
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}" +
    "main{max-width:34rem;margin:0 auto;padding:18vh 24px 0;text-align:center}" +
    "h1{font-size:1.4rem;margin:0 0 12px}p{color:#9aa6c0;line-height:1.5;margin:0 0 22px}" +
    "a{display:inline-block;padding:12px 22px;border-radius:14px;background:#6ea8fe;" +
    "color:#0a0e1a;text-decoration:none;font-weight:600}" +
    "</style></head><body><main><h1>Offline</h1>" +
    "<p>The game has not been stored on this device yet. Connect once, and it will " +
    "work offline from then on.</p><a href=\"./\">Try again</a></main></body></html>";

  var byPath = Object.create(null); // pathname -> { path, rev }
  (MANIFEST.files || []).forEach(function (f) {
    byPath[new URL(f.path, self.location.href).pathname] = f;
  });

  function keyFor(f) {
    return new URL(f.path + "?__rev=" + f.rev, self.location.href).href;
  }

  function matchCached(f) {
    return caches.open(CACHE).then(function (cache) {
      return cache.match(keyFor(f));
    });
  }

  function isNetworkOnly(pathname) {
    for (var i = 0; i < NETWORK_ONLY.length; i++) {
      if (pathname.slice(-NETWORK_ONLY[i].length) === NETWORK_ONLY[i]) return true;
    }
    return false;
  }

  function tellClients(msg) {
    return self.clients.matchAll({ includeUncontrolled: true }).then(function (cs) {
      cs.forEach(function (c) { try { c.postMessage(msg); } catch (e) {} });
    });
  }

  /* ---------- install: precache, per-file tolerant ---------- */
  function precache() {
    var queue = (MANIFEST.files || []).slice();
    // `done` = files present in the cache; `downloaded` = files actually
    // fetched. They differ on an update, and that difference is the whole
    // point of content-addressed keys: a one-file change must cost one file.
    var done = 0, downloaded = 0, failed = [];

    function workerFn() {
      var f = queue.shift();
      if (!f) return Promise.resolve();
      // One file's failure — a 404, a dropped connection, a quota error from
      // cache.open/put — must never reject the install. A rejected install
      // would leave the device with no worker at all (and retry forever), when
      // the honest outcome is partial offline coverage and a truthful status.
      return caches.open(CACHE)
        .then(function (cache) {
          return cache.match(keyFor(f)).then(function (hit) {
            if (hit) return; // unchanged bytes: no download
            // Built fresh rather than forwarded: the Cache API request must
            // not inherit a caller's cache mode, and a revalidation is what we
            // want here anyway.
            return fetch(new Request(f.path, { cache: "reload" })).then(function (res) {
              if (!res || !res.ok) throw new Error("HTTP " + (res && res.status));
              return cache.put(keyFor(f), res).then(function () { downloaded++; });
            });
          });
        })
        .then(function () { done++; })
        .catch(function () { failed.push(f.path); })
        .then(function () { return workerFn(); });
    }

    var workers = [];
    for (var i = 0; i < CONCURRENCY; i++) workers.push(workerFn());

    return Promise.all(workers).then(function () {
      // Partial coverage is reported, not hidden: one failed file must not
      // abort the install (a flaky network would then lose offline entirely),
      // but the page is told so it does not claim "ready" untruthfully.
      return tellClients({
        type: "PRECACHED",
        hash: MANIFEST.hash,
        cached: done,
        downloaded: downloaded,
        total: (MANIFEST.files || []).length,
        failed: failed,
      });
    });
  }

  self.addEventListener("install", function (event) {
    // No skipWaiting() here: activating mid-game is what interrupts a player.
    // offline.js applies the waiting worker when the game screen is hidden.
    event.waitUntil(precache());
  });

  /* ---------- activate: prune to exactly this generation ---------- */
  function prune() {
    return caches.open(CACHE).then(function (cache) {
      return cache.keys().then(function (reqs) {
        var keep = Object.create(null);
        (MANIFEST.files || []).forEach(function (f) { keep[keyFor(f)] = true; });
        return Promise.all(reqs.map(function (req) {
          return keep[req.url] ? null : cache.delete(req);
        }));
      });
    });
  }

  self.addEventListener("activate", function (event) {
    event.waitUntil(
      prune().then(function () { return self.clients.claim(); })
    );
  });

  /* ---------- message: apply an update at a safe moment ---------- */
  self.addEventListener("message", function (event) {
    var data = event.data || {};
    if (data.type === "SKIP_WAITING") self.skipWaiting();
  });

  /* ---------- fetch ---------- */
  function navigation(request) {
    return fetch(request.url, { cache: "no-cache", headers: { accept: "text/html" } })
      .then(function (res) {
        if (res && res.ok) return res;
        throw new Error("HTTP " + (res && res.status));
      })
      .catch(function () {
        var shell = byPath[new URL("index.html", self.location.href).pathname];
        return (shell ? matchCached(shell) : Promise.resolve(null)).then(function (hit) {
          if (hit) return hit;
          return new Response(OFFLINE_HTML, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        });
      });
  }

  function asset(url) {
    var entry = byPath[url.pathname];
    var fromCache = entry ? matchCached(entry) : Promise.resolve(null);
    return fromCache.then(function (hit) {
      if (hit) return hit; // cache-first: the key is content-addressed, so it cannot be stale
      // Never forward the original request: its cache mode ("no-cache" for deck
      // JSON, "force-cache" for audio) would forbid or distort this fetch.
      return fetch(new Request(url.href, { cache: "default" })).then(function (res) {
        if (res && (res.ok || res.type === "opaque")) return res;
        throw new Error("HTTP " + (res && res.status));
      }).catch(function () {
        return fromCache.then(function (again) {
          return again || Response.error();
        });
      });
    });
  }

  self.addEventListener("fetch", function (event) {
    var request = event.request;
    if (request.method !== "GET") return;

    var url;
    try { url = new URL(request.url); } catch (e) { return; }

    // Other origins (the NASA satellite tiles) are never touched: the map
    // already falls back to the bundled vector outline.
    if (url.origin !== self.location.origin) return;

    // The freshness probe must always reach the network.
    if (isNetworkOnly(url.pathname)) return;

    if (request.mode === "navigate") {
      event.respondWith(navigation(request));
      return;
    }
    event.respondWith(asset(url));
  });
})();
