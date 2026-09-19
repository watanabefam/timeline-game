// narration.js — Kokoro-82M TTS narration controller (added 2026-09).
// Classic (non-module) IIFE exposing window.Narrator. Loaded before timeline.js.
// Architecture:
//   - narration-worker.js (module worker) owns Kokoro TTS + espeak phonemizer.
//   - This controller caches PCM in IndexedDB (LRU, ~25 MB), plays at 24 kHz
//     via WebAudio, and falls back to speechSynthesis for tiny generic lines.
//   - Narration reads the card title + fact aloud, with year tokens stripped
//     from the spoken text so the answer is never given away (the card display
//     keeps them). No correct/incorrect feedback is narrated.
// Persistence: timeline.narration.{enabled,voice,quality}.

(function () {
  "use strict";

  if (window.Narrator) return; // double-include guard

  var $ = function (id) { return document.getElementById(id); };

  var LS_ENABLED = "timeline.narration.enabled";
  var LS_VOICE = "timeline.narration.voice";
  var LS_QUALITY = "timeline.narration.quality";

  var VOICE_NAMES = {
    af_alloy: "Alloy", af_aoede: "Aoede", af_bella: "Bella", af_heart: "Heart",
    af_jessica: "Jessica", af_kore: "Kore", af_nicole: "Nicole", af_nova: "Nova",
    af_river: "River", af_sarah: "Sarah", af_sky: "Sky",
    am_adam: "Adam", am_echo: "Echo", am_eric: "Eric", am_fenrir: "Fenrir",
    am_liam: "Liam", am_michael: "Michael", am_onyx: "Onyx", am_puck: "Puck",
    am_santa: "Santa",
    bf_alice: "Alice", bf_emma: "Emma", bf_isabella: "Isabella", bf_lily: "Lily",
    bm_daniel: "Daniel", bm_fable: "Fable", bm_george: "George", bm_lewis: "Lewis",
  };
  var VOICE_IDS = Object.keys(VOICE_NAMES);
  var QUALITY_LABELS = {
    standard: "Standard (offline)",
    high: "High — first use downloads ~160 MB",
    best: "Best — first use downloads ~320 MB",
  };
  var QUALITY_DTYPES = { standard: "q8", high: "fp16", best: "fp32" };

  var CACHE_DB = "timeline-narration";
  var CACHE_STORE = "audio";
  var CACHE_MAX_BYTES = 25 * 1024 * 1024;
  var MICRO_MAX_TOKENS = 10;
  var JOB_TIMEOUT_MS = 120000;
  // High/Best quality download a ~160/320 MB model on first use. Jobs queued
  // while that download runs must not die at 120s — wait for the model.
  var DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;
  // Kokoro is only used once the pipeline is warm (model loaded + a few jobs
  // synthesized). Before that, synthesis is too slow to stay aligned with the
  // screen, so narration uses the instant system voice instead.
  var JOBS_WARM_THRESHOLD = 3;

  var worker = null;
  var pending = Object.create(null); // jobId -> {resolve, reject, timer}
  var jobKey = Object.create(null);  // jobId -> idb cache key
  var inFlight = Object.create(null); // prefetch text -> true (dedupe re-prefetches)
  var idb = null;
  var audioCtx = null;
  var currentSource = null;
  var jobSeq = 0;
  var booted = false;
  var modelDownloading = false; // worker is fetching the selected model
  var workerBroken = false; // module worker unavailable (e.g. file:// protocol)
  var jobsCompleted = 0; // synthesis jobs finished — drives the warm-up gate

  var state = {
    enabled: readBool(LS_ENABLED, false),
    voice: readStr(LS_VOICE, "af_heart"),
    quality: readStr(LS_QUALITY, "standard"),
  };
  if (VOICE_IDS.indexOf(state.voice) === -1) state.voice = "af_heart";
  if (!QUALITY_LABELS[state.quality]) state.quality = "standard";

  // --- localStorage helpers ----------------------------------------------------

  function readBool(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : v === "1";
    } catch (e) { return fallback; }
  }
  function readStr(key, fallback) {
    try { var v = localStorage.getItem(key); return v === null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function writeLS(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* quota / disabled */ }
  }

  // --- IndexedDB PCM cache (LRU, ~25 MB) --------------------------------------

  function openDB() {
    if (idb) return Promise.resolve(idb);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(CACHE_DB, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          db.createObjectStore(CACHE_STORE, { keyPath: "k" });
        }
      };
      req.onsuccess = function () { idb = req.result; resolve(idb); };
      req.onerror = function () { idb = null; reject(req.error); };
    });
  }

  function idbGet(k) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(CACHE_STORE, "readonly");
        var req = t.objectStore(CACHE_STORE).get(k);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbPut(entry) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(CACHE_STORE, "readwrite");
        t.objectStore(CACHE_STORE).put(entry);
        t.oncomplete = resolve;
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  // FNV-1a over the speaking key (text|voice|dtype): collision-safe enough.
  function hashKey(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return ("0000000" + (h >>> 0).toString(16)).slice(-8);
  }
  function cacheKey(clientText) {
    return hashKey(clientText + "\u0001" + state.voice + "\u0001" + QUALITY_DTYPES[state.quality]);
  }

  function storePcm(key, pcm, sampleRate) {
    var entry = { k: key, pcm: pcm, sampleRate: sampleRate, ts: Date.now() };
    entry.bytes = pcm.byteLength;
    return idbPut(entry).then(function () { return evictIfNeeded(); });
  }

  // LRU eviction: drop oldest entries until total is under the cap.
  function evictIfNeeded() {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(CACHE_STORE, "readonly");
        var req = t.objectStore(CACHE_STORE).getAll();
        req.onsuccess = function () {
          var entries = req.result || [];
          var total = 0;
          entries.forEach(function (e) { total += (e.bytes || e.pcm.byteLength || 0); });
          if (total <= CACHE_MAX_BYTES) { resolve(); return; }
          entries.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
          var freed = 0;
          var next = entries.slice();
          var t2 = db.transaction(CACHE_STORE, "readwrite");
          var store2 = t2.objectStore(CACHE_STORE);
          t2.oncomplete = function () { resolve(); };
          t2.onerror = function () { reject(t2.error); };
          (function drop() {
            var e = next.shift();
            if (!e || total - freed <= CACHE_MAX_BYTES) return;
            store2.delete(e.k);
            freed += (e.bytes || e.pcm.byteLength || 0);
            drop();
          })();
        };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  // --- Worker -------------------------------------------------------------------

  function ensureWorker() {
    if (worker) return;
    if (workerBroken) return;
    try {
      worker = new Worker(
        "narration-worker.js?v=7",
        { type: "module", name: "narration-kokoro" }
      );
    } catch (e) {
      // Module workers are blocked on file:// (origin "null") and some
      // embedded contexts — fall back to the system voice instead of silence.
      worker = null;
      workerBroken = true;
      return;
    }
    worker.addEventListener("message", onWorkerMessage);
    worker.addEventListener("error", function (e) {
      // Fail any in-flight jobs; the caller falls back to micro/silence.
      modelDownloading = false;
      Object.keys(pending).forEach(function (k) {
        var p = pending[k];
        clearTimeout(p.timer);
        p.reject(new Error("worker error: " + (e && e.message || "")));
        delete pending[k];
        delete jobKey[k];
      });
    });
  }

  function onWorkerMessage(ev) {
    var m = ev.data;
    if (!m) return;
    if (m.type === "audio") {
      jobsCompleted++;
      var p = pending[m.id];
      if (!p) return;
      clearTimeout(p.timer);
      delete pending[m.id];
      var key = jobKey[m.id];
      delete jobKey[m.id];
      if (key) storePcm(key, m.pcm, m.sampleRate).catch(function () {});
      p.resolve(m);
    } else if (m.type === "dropped" || m.type === "error") {
      var pr = pending[m.id];
      if (!pr) return;
      clearTimeout(pr.timer);
      delete pending[m.id];
      delete jobKey[m.id];
      // Surface synthesis failures on the settings status line (and console)
      // so a broken model download is visible instead of silent.
      if (m.type === "error" && booted) {
        var el = $("narration-status");
        if (el) el.textContent = "Voice error: " + (m.message || "unknown");
      }
      if (m.type === "error") console.warn("narration:", m.message);
      pr.reject(new Error(m.message || "dropped"));
    } else if (m.type === "status") {
      onStatus(m);
    }
  }

  function onStatus(m) {
    // Track model download state so in-flight jobs wait instead of timing out.
    if (m.phase === "model-start") {
      modelDownloading = true;
      // Pending jobs were armed with the 120s timeout before the worker
      // reported the download — re-arm them to outlast it.
      Object.keys(pending).forEach(function (id) {
        var p = pending[id];
        clearTimeout(p.timer);
        p.timer = setTimeout(function () {
          delete pending[id];
          delete jobKey[id];
          p.reject(new Error("narration timeout"));
        }, DOWNLOAD_TIMEOUT_MS);
      });
    } else if (m.phase === "model-progress") {
      modelDownloading = true;
    } else if (m.phase === "model-ready") {
      modelDownloading = false;
    }
    if (!booted) return; // status line idle until the player opens settings
    var el = $("narration-status");
    if (!el) return;
    if (m.phase === "seed-progress") {
      el.textContent = "Preparing offline voice… " + (m.done || 0) + "/" + (m.total || 0);
    } else if (m.phase === "seed-failed" || m.phase === "seed-done") {
      el.textContent = "Voice ready";
    } else if (m.phase === "model-start") {
      var q = state.quality;
      el.textContent = q === "standard"
        ? "Starting offline voice…"
        : (q === "high" ? "Downloading HD voice (first use, ~160 MB)…" : "Downloading HD voice (first use, ~320 MB)…");
    } else if (m.phase === "model-progress" && m.total > 0) {
      el.textContent = "Downloading voice… " + Math.round((100 * (m.loaded || 0)) / m.total) + "%";
    } else if (m.phase === "model-ready") {
      el.textContent = voiceLabel(state.voice) + " · " + QUALITY_LABELS[state.quality];
    }
  }

  // --- Synthesis request -----------------------------------------------------------

  // Synthesis request. Priorities:
//   "now"     — screen-aligned speech: cache hit plays Kokoro instantly; a
//               cache miss speaks the system voice immediately (aligned) and
//               posts a background Kokoro job that ONLY warms the cache.
//   "prefetch" — warm the cache; never plays.
//   "test"    — deliberate sample: waits for Kokoro and plays when ready.
  function synth(clientText, priority) {
    var text = String(clientText || "").trim();
    if (!text || !state.enabled) return Promise.resolve(null);
    var key = cacheKey(clientText);
    var isNow = priority === "now";
    var isTest = priority === "test";
    return idbGet(key).then(function (hit) {
      if (hit && hit.pcm) {
        // Instant aligned playback — the only place Kokoro plays for "now".
        if (isNow || isTest) playPcm(hit.pcm, hit.sampleRate || 24000);
        return hit.pcm;
      }
      // Not cached. "now" requests speak instantly with the system voice so
      // audio always matches the screen; a background job warms the cache.
      if (isNow) {
        speakSystem(text);
        if (booted) {
          var st = $("narration-status");
          if (st) st.textContent = "System voice (warming Kokoro…)";
        }
      }
      if (inFlight[text]) return Promise.resolve(null); // prefetch already warming
      ensureWorker();
      if (!worker) return Promise.resolve(null);
      var jobId = "job" + (++jobSeq);
      jobKey[jobId] = key;
      var p = new Promise(function (resolve, reject) {
        pending[jobId] = {
          resolve: resolve,
          reject: reject,
          timer: setTimeout(function () {
            delete pending[jobId];
            delete jobKey[jobId];
            reject(new Error("narration timeout"));
          }, modelDownloading ? DOWNLOAD_TIMEOUT_MS : JOB_TIMEOUT_MS),
        };
        worker.postMessage({
          type: "generate",
          id: jobId,
          text: text,
          voice: state.voice,
          quality: state.quality,
          priority: priority,
        });
      }).then(function (m) {
        // Background jobs never play — they only warm the cache. The only
        // Kokoro playback is the synchronous cache-hit path above (and test).
        if (isTest) playPcm(m.pcm, m.sampleRate || 24000);
        return m.pcm;
      });
      if (priority === "prefetch") inFlight[text] = p;
      return p;
    });
  }

  // --- WebAudio playback (interrupting) --------------------------------------------

  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") {
      var r = audioCtx.resume();
      if (r && r.catch) r.catch(function () {});
    }
    return audioCtx;
  }

  // Autoplay unlock: browsers suspend AudioContexts created outside a user
  // gesture (the async synth() continuation is not one). Create/resume the
  // context synchronously on the first pointer/key interaction so narration
  // is audible even when the player jumps straight into a game.
  function unlockAudio() {
    ensureAudio();
  }
  var unlockOnce = function () {
    unlockAudio();
    // Prime speechSynthesis inside the gesture: Chromium silently drops
    // speak() calls made outside a user gesture (our async speakEvent path),
    // so unlock it here with a silent utterance.
    if ("speechSynthesis" in window) {
      try {
        var u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        speechSynthesis.speak(u);
        speechSynthesis.cancel();
      } catch (e) { /* non-fatal */ }
    }
    document.removeEventListener("pointerdown", unlockOnce);
    document.removeEventListener("keydown", unlockOnce);
  };
  document.addEventListener("pointerdown", unlockOnce);
  document.addEventListener("keydown", unlockOnce);

  function playPcm(pcm, sampleRate) {
    var ctx = ensureAudio();
    if (!ctx) return;
    stopPlayback();
    var start = function () {
      var buf = ctx.createBuffer(1, pcm.length, sampleRate || 24000);
      buf.copyToChannel(pcm, 0);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();
      currentSource = src;
      src.onended = function () { if (currentSource === src) currentSource = null; };
    };
    if (ctx.state === "suspended") {
      // Browsers suspend the context after tab switches; resume() outside a
      // gesture is rejected, so wait for it before starting playback.
      var r = ctx.resume();
      if (r && r.then) r.then(start).catch(function () {});
      else start();
    } else {
      start();
    }
  }

  function stopPlayback() {
    if (currentSource) {
      try { currentSource.stop(); } catch (e) { /* already ended */ }
      currentSource = null;
    }
  }

  // --- speechSynthesis micro fallback (never card content) ------------------------------

  function micro(text) {
    if (!state.enabled) return;
    var tokens = String(text || "").split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || tokens.length > MICRO_MAX_TOKENS) return;
    if (!("speechSynthesis" in window)) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(tokens.join(" "));
      u.lang = "en-US";
      u.rate = 1.05;
      speechSynthesis.speak(u);
    } catch (e) { /* non-fatal */ }
  }

  // System-voice fallback for card text when the Kokoro worker is unavailable
  // (file:// protocol blocks module workers). Same year-stripping as the main
  // path so the answer is never given away. Picks the best natural-sounding
  // system voice instead of the browser default (which can be robotic).
  var SYSTEM_VOICE_PREF = [
    "Samantha", "Karen", "Daniel", "Moira", "Tessa", "Fiona", "Kate",
  ];
  var systemVoice = null;
  function pickSystemVoice() {
    if (systemVoice || !("speechSynthesis" in window)) return systemVoice;
    var voices = window.speechSynthesis.getVoices();
    if (!voices || !voices.length) return null;
    // 1) exact preference match
    for (var i = 0; i < SYSTEM_VOICE_PREF.length; i++) {
      for (var j = 0; j < voices.length; j++) {
        if (voices[j].name === SYSTEM_VOICE_PREF[i]) {
          systemVoice = voices[j];
          return systemVoice;
        }
      }
    }
    // 2) any en-US / en-GB local voice (skip novelty voices)
    var novelty = /bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|rocko|grandma|grandpa|reed|sandy|shelley|eddy|flo/i;
    for (var k = 0; k < voices.length; k++) {
      var v = voices[k];
      if (/^en(-US|-GB|-AU|-IE|-ZA)?$/i.test(v.lang) && v.localService && !novelty.test(v.name)) {
        systemVoice = v;
        return systemVoice;
      }
    }
    return null;
  }
  // Voices load asynchronously — re-pick once they arrive so the first
  // utterance doesn't fall back to the browser default.
  if ("speechSynthesis" in window && "onvoiceschanged" in window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = function () {
      pickSystemVoice();
    };
  }
  function speakSystem(text) {
    if (!state.enabled || !text) return;
    if (!("speechSynthesis" in window)) return;
    try {
      speechSynthesis.cancel();
      var clean = stripYears(text);
      // Chrome cancels utterances longer than ~300 chars — chunk by sentence
      // and chain them so long card text still reads fully.
      var chunks = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
      var v = pickSystemVoice();
      var i = 0;
      function next() {
        if (i >= chunks.length) return;
        var u = new SpeechSynthesisUtterance(chunks[i].trim());
        u.lang = "en-US";
        u.rate = 1.0;
        if (v) u.voice = v;
        u.onend = next;
        u.onerror = function (e) { if (e.error !== "canceled") next(); };
        speechSynthesis.speak(u);
        i++;
      }
      next();
    } catch (e) { /* non-fatal */ }
  }

  // Kokoro is only used once the pipeline is warm enough to stay aligned.
  function kokoroWarm() {
    return jobsCompleted >= JOBS_WARM_THRESHOLD;
  }

  // Strip year-like tokens from SPOKEN text only (the card display keeps them).
  // Existing decks embed answer years in facts (e.g. "c. 2348 BC", "in 1826");
  // narration must never give the answer away. Future decks should keep years
  // solely in the year field (enforced by the content gate), making this a
  // defensive backstop rather than the primary rule.
  function stripYears(text) {
    var s = String(text || "");
    // Parenthesized year groups: "(c. 2550 BCE)", "(586 BC)", "(509–27 BC)", "(1054)", "(313)"
    s = s.replace(/\(\s*(?:c\.|circa)?\s*\d{1,4}s?\s*(?:–|-|to)?\s*\d{0,4}s?\s*(?:BC|AD|BCE|CE)?\s*\)/gi, "");
    // Bare years with era: "c. 2348 BC", "4004 BC", "70 AD", "753 BC"
    s = s.replace(/\b(?:c\.|circa)\s*\d{1,4}s?\s*(?:BC|AD|BCE|CE)\b/gi, "");
    s = s.replace(/\b\d{1,4}s?\s*(?:BC|AD|BCE|CE)\b/gi, "");
    // Bare 4-digit years and ranges: "in 2007", "the 1982 Nobel", "1750–1820"
    s = s.replace(/\b(?:1[0-9]{3}|2[0-9]{3})s?\s*(?:–|-|to)\s*(?:1[0-9]{3}|2[0-9]{3})s?\b/g, "");
    s = s.replace(/\b(?:1[0-9]{3}|2[0-9]{3})s?\b/g, "");
    // 3-digit years in year context: "in 988", "c. 610", "around 450", "~500", "In 410,"
    s = s.replace(/\b(?:in|on|by|at|of|from|around|circa|c\.|~|near)\s*\d{1,3}s?\b/gi, " ");
    // Leading year + colon: "1969: Armstrong..." -> "Armstrong..."
    s = s.replace(/^\s*(?:1[0-9]{3}|2[0-9]{3})s?\s*:\s*/, "");
    // Dangling prepositions before punctuation/end/"and"
    s = s.replace(/\s+(?:in|on|by|at|of|from|around|circa|c\.|near)\s*(?=([,.;:!?]|$|\band\b))/gi, " ");
    // Collapse whitespace + space before punctuation
    s = s.replace(/\s{2,}/g, " ");
    s = s.replace(/\s+([,.;:!?])/g, "$1");
    return s.trim();
  }

  // --- Public API --------------------------------------------------------------------

  var Narrator = {
    isEnabled: function () { return state.enabled; },
    getVoice: function () { return state.voice; },
    getQuality: function () { return state.quality; },

    // Speak the current card TITLE + FACT aloud. The fact is spoken with year
    // tokens stripped so the answer is never given away (the card display keeps
    // them). High priority: supersedes queued prefetches.
    speakEvent: function (ev) {
      if (!state.enabled || !ev || !ev.title) return Promise.resolve(null);
      var text = ev.title;
      if (ev.fact) text += ". " + stripYears(ev.fact);
      // Clean start: stop any system TTS still speaking the previous card.
      if ("speechSynthesis" in window) { try { speechSynthesis.cancel(); } catch (e) {} }
      // file:// (or any context where the module worker is blocked): fall back
      // to the system voice so narration still works.
      if (workerBroken) {
        speakSystem(text);
        return Promise.resolve(null);
      }
      // Cold pipeline (model still loading / first syntheses): Kokoro is too
      // slow to stay aligned with the screen — speak instantly with the system
      // voice. The prefetch queue warms the cache in the background.
      if (!kokoroWarm()) {
        speakSystem(text);
        return Promise.resolve(null);
      }
      // Warm: cache hit plays Kokoro instantly; a miss speaks the system voice
      // immediately (aligned) and warms the cache for next time.
      return synth(text, "now").catch(function () {});
    },

    // Warm the cache for upcoming event titles (low priority, no playback).
    prefetch: function (events) {
      if (!state.enabled || !events || events.length === 0) return;
      var seen = Object.create(null);
      events.forEach(function (ev) {
        if (!ev || !ev.title) return;
        var t = String(ev.title).trim();
        if (!t || seen[t]) return;
        seen[t] = true;
        var text = t;
        if (ev.fact) text += ". " + stripYears(ev.fact);
        // Skip texts already in flight (queued or running) so re-prefetching
        // after each placement never synthesizes the same card twice.
        if (inFlight[text]) return;
        synth(text, "prefetch")
          .catch(function () {})
          .then(function () { delete inFlight[text]; });
      });
    },

    // Tiny fixed generic line via speechSynthesis — never game content.
    micro: micro,

    stop: function () {
      stopPlayback();
      if ("speechSynthesis" in window) { try { speechSynthesis.cancel(); } catch (e) {} }
    },

    syncControls: syncControls,
    // Create/resume the AudioContext synchronously — call from a click handler
    // (e.g. Start!) so autoplay policy doesn't leave narration silent.
    unlock: unlockAudio,
    setEnabled: function (on) {
      state.enabled = !!on;
      writeLS(LS_ENABLED, state.enabled ? "1" : "0");
      if (!state.enabled) {
        if (worker) worker.terminate();
        worker = null;
        modelDownloading = false;
        if ("speechSynthesis" in window) { try { speechSynthesis.cancel(); } catch (e) {} }
      }
      syncControls();
    },
    setVoice: function (id) {
      if (VOICE_IDS.indexOf(id) === -1) return;
      state.voice = id;
      writeLS(LS_VOICE, id);
      syncControls();
    },
    setQuality: function (q) {
      if (!QUALITY_LABELS[q]) return;
      state.quality = q;
      writeLS(LS_QUALITY, q);
      // Eagerly drop the worker so the next speech loads the new dtype.
      if (worker) worker.terminate();
      worker = null;
      modelDownloading = false;
      syncControls();
    },

    // Neutral sample line in the selected voice/quality.
    test: function () {
      if (!state.enabled) Narrator.setEnabled(true);
      syncControls();
      if (workerBroken) {
        speakSystem("Narration is ready. Stories last for thousands of years.");
        return;
      }
      synth("Narration is ready. Stories last for thousands of years.", "test")
        .catch(function () { micro("Narration is ready."); });
    },
  };

  // --- Settings UI --------------------------------------------------------------------

  function voiceLabel(id) {
    return VOICE_NAMES[id] ? VOICE_NAMES[id] + " (" + id + ")" : id;
  }

  function buildControls() {
    var voiceSel = $("narration-voice");
    if (voiceSel && voiceSel.options.length === 0) {
      VOICE_IDS.forEach(function (id) {
        var o = document.createElement("option");
        o.value = id;
        o.textContent = voiceLabel(id);
        voiceSel.appendChild(o);
      });
    }
  }

  function syncControls() {
    buildControls();
    var btn = $("narration-btn");
    var voiceSel = $("narration-voice");
    var qualitySel = $("narration-quality");
    var status = $("narration-status");
    if (btn) {
      btn.setAttribute("aria-pressed", state.enabled ? "true" : "false");
      btn.textContent = state.enabled ? "🗣️ On" : "🔇 Off";
    }
    if (voiceSel) voiceSel.value = state.voice;
    if (qualitySel) {
      for (var i = 0; i < qualitySel.options.length; i++) {
        qualitySel.options[i].textContent = QUALITY_LABELS[qualitySel.options[i].value];
      }
      qualitySel.value = state.quality;
    }
    if (status) {
      if (workerBroken) {
        status.textContent = state.enabled
          ? "System voice (file:// preview — Kokoro needs a web server)"
          : "Off";
      } else {
        status.textContent = state.enabled ? voiceLabel(state.voice) + " · " + QUALITY_LABELS[state.quality] : "Off";
      }
    }
    booted = booted || !!btn;
  }

  function setEnabledFromUI(on) {
    Narrator.setEnabled(on);
    if (on) ensureAudio(); // unlock audio on the settings gesture
  }

  function wireSettings() {
    var btn = $("narration-btn");
    var voiceSel = $("narration-voice");
    var qualitySel = $("narration-quality");
    var testBtn = $("narration-test");
    if (btn) btn.addEventListener("click", function () { setEnabledFromUI(!state.enabled); });
    if (voiceSel) voiceSel.addEventListener("change", function () { Narrator.setVoice(voiceSel.value); });
    if (qualitySel) qualitySel.addEventListener("change", function () { Narrator.setQuality(qualitySel.value); });
    if (testBtn) testBtn.addEventListener("click", function () { Narrator.test(); });
  }

  // --- Boot --------------------------------------------------------------------------

  function boot() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
      return;
    }
    wireSettings();
    syncControls();
  }
  boot();

  window.Narrator = Narrator;
})();