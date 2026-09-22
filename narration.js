/* narration.js — pre-rendered deck narration playback.
 *
 * The voice audio SHIPS WITH THE DECK (decks/<id>/narration/<event-id>.mp3);
 * nothing is synthesized at runtime. This module resolves the clip for the
 * current card and plays it instantly:
 *
 *   http(s)  : fetch + decodeAudioData -> AudioBuffer cache -> BufferSource
 *              (pre-decoded, so playback is effectively instant)
 *   file://  : one persistent HTMLAudioElement, unlocked on the first gesture
 *              (WebKit unlocks per media ELEMENT, not per page), reused by
 *              swapping .src — fetch() is blocked under file:// so Web Audio
 *              can't get the bytes there
 *   missing  : system voice (speechSynthesis) as a last resort
 *
 * See doc/CROSS_PLATFORM_ROADMAP.md §19.12.
 */
(function () {
  "use strict";

  var LS_ENABLED = "timeline.narration.enabled";
  var PREFETCH_AHEAD = 5;
  // 44-byte silent WAV data URL — played inside a gesture to unlock the element.
  var SILENT_WAV =
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

  var $ = function (id) { return document.getElementById(id); };

  var enabled = false;
  var deck = null;                 // active deck (for clip lookup)
  var ctx = null;                  // single AudioContext, reused
  var buffers = Object.create(null); // url -> AudioBuffer
  var el = null;                   // persistent media element (file:// / fallback)
  var elUnlocked = false;
  var source = null;               // current AudioBufferSourceNode
  var pendingSpeakTimer = 0;       // deferred first speak (game-start sync)
  // fetch() is blocked under file:// (origin "null"), so Web Audio can't get
  // the bytes there — start on the media-element path instead (no noisy CORS
  // errors in the console).
  var webAudioOK = location.protocol !== "file:";

  // --- storage (guarded: private mode / file:// quirks) ------------------------
  function readLS(k, dflt) {
    try { var v = localStorage.getItem(k); return v == null ? dflt : v; } catch (e) { return dflt; }
  }
  function writeLS(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // --- system-voice fallback (only when a clip is missing/fails) ---------------
  // Same year-stripping as the authoring recipe, so the answer is never spoken.
  function stripYears(text) {
    var s = String(text || "");
    s = s.replace(/\(\s*(?:c\.|circa)?\s*\d{1,4}s?\s*(?:–|-|to)?\s*\d{0,4}s?\s*(?:BC|AD|BCE|CE)?\s*\)/gi, "");
    s = s.replace(/\b(?:c\.|circa)\s*\d{1,4}s?\s*(?:BC|AD|BCE|CE)\b/gi, "");
    s = s.replace(/\b\d{1,4}s?\s*(?:BC|AD|BCE|CE)\b/gi, "");
    s = s.replace(/\b(?:1[0-9]{3}|2[0-9]{3})s?\s*(?:–|-|to)\s*(?:1[0-9]{3}|2[0-9]{3})s?\b/g, "");
    s = s.replace(/\b(?:1[0-9]{3}|2[0-9]{3})s?\b/g, "");
    s = s.replace(/\b(?:in|on|by|at|of|from|around|circa|c\.|~|near)\s*\d{1,3}s?\b/gi, " ");
    s = s.replace(/^\s*(?:1[0-9]{3}|2[0-9]{3})s?\s*:\s*/, "");
    s = s.replace(/\s+(?:in|on|by|at|of|from|around|circa|c\.|near)\s*(?=([,.;:!?]|$|\band\b))/gi, " ");
    s = s.replace(/\s{2,}/g, " ");
    s = s.replace(/\s+([,.;:!?])/g, "$1");
    return s.trim();
  }

  var SYSTEM_VOICE_PREF = ["Samantha", "Karen", "Daniel", "Moira", "Tessa", "Fiona", "Kate"];
  var systemVoice = null;
  function pickSystemVoice() {
    if (systemVoice || !("speechSynthesis" in window)) return systemVoice;
    var voices = window.speechSynthesis.getVoices();
    if (!voices || !voices.length) return null;
    for (var i = 0; i < SYSTEM_VOICE_PREF.length; i++) {
      for (var j = 0; j < voices.length; j++) {
        if (voices[j].name === SYSTEM_VOICE_PREF[i]) { systemVoice = voices[j]; return systemVoice; }
      }
    }
    var novelty = /bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|rocko|grandma|grandpa|reed|sandy|shelley|eddy|flo/i;
    for (var k = 0; k < voices.length; k++) {
      var v = voices[k];
      if (/^en(-US|-GB|-AU|-IE|-ZA)?$/i.test(v.lang) && v.localService && !novelty.test(v.name)) {
        systemVoice = v; return systemVoice;
      }
    }
    return null;
  }
  if ("speechSynthesis" in window && "onvoiceschanged" in window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = function () { pickSystemVoice(); };
  }
  function speakSystem(text) {
    if (!enabled || !text) return;
    if (!("speechSynthesis" in window)) return;
    try {
      speechSynthesis.cancel();
      var clean = stripYears(text);
      var chunks = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
      var v = pickSystemVoice();
      var i = 0;
      function next() {
        if (i >= chunks.length) return;
        var u = new SpeechSynthesisUtterance(chunks[i].trim());
        u.lang = "en-US"; u.rate = 1.0;
        if (v) u.voice = v;
        u.onend = next;
        u.onerror = function (e) { if (e.error !== "canceled") next(); };
        speechSynthesis.speak(u); i++;
      }
      next();
    } catch (e) { /* non-fatal */ }
  }

  // --- audio context (single, reused, resumed inside gestures) ------------------
  function ensureCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === "suspended") {
      var r = ctx.resume();
      if (r && r.catch) r.catch(function () {});
    }
    return ctx;
  }

  // Called from click handlers. Resumes the context AND unlocks the media
  // element (WebKit grants playback permission per element, so the element
  // must be played once inside a gesture to be usable later).
  function unlock() {
    ensureCtx();
    if (!el) { try { el = new Audio(); el.preload = "auto"; } catch (e) { el = null; } }
    if (el && !elUnlocked && (!el.src || el.src.indexOf("data:") === 0)) {
      try {
        el.muted = true;
        el.src = SILENT_WAV;
        var p = el.play();
        if (p && p.then) {
          p.then(function () {
            elUnlocked = true;
            if (el.src.indexOf("data:") === 0) { el.pause(); el.currentTime = 0; }
            el.muted = false;
          }).catch(function () { el.muted = false; });
        } else { elUnlocked = true; el.muted = false; }
      } catch (e) { try { el.muted = false; } catch (e2) {} }
    }
  }

  // --- clip resolution ---------------------------------------------------------
  function urlFor(ev) {
    if (!deck || !deck.narration || !deck.narration.files || !ev) return null;
    var rec = deck.narration.files[ev.id];
    if (!rec) return null;
    return typeof rec === "string" ? rec : rec.path || null;
  }

  // --- playback ----------------------------------------------------------------
  function stopPlayback() {
    if (source) { try { source.stop(); } catch (e) {} source = null; }
    if (el && !el.paused) { try { el.pause(); } catch (e) {} }
  }
  function playBuffer(buf) {
    var c = ensureCtx();
    if (!c) return false;
    stopPlayback();
    var s = c.createBufferSource();
    s.buffer = buf;
    s.connect(c.destination);
    s.onended = function () { if (source === s) source = null; };
    s.start();
    source = s;
    return true;
  }
  function loadBuffer(url) {
    if (buffers[url]) return Promise.resolve(buffers[url]);
    return fetch(url, { cache: "force-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error(url + " HTTP " + r.status);
        return r.arrayBuffer();
      })
      .then(function (raw) {
        var c = ensureCtx();
        if (!c) throw new Error("no AudioContext");
        return new Promise(function (res, rej) { c.decodeAudioData(raw, res, rej); });
      })
      .then(function (b) { buffers[url] = b; return b; });
  }
  function playElement(url) {
    if (!el) { try { el = new Audio(); } catch (e) { return false; } }
    try {
      stopPlayback();
      el.muted = false;
      el.src = url;
      var p = el.play();
      if (p && p.catch) p.catch(function () {});
      return true;
    } catch (e) { return false; }
  }
  function play(ev) {
    var url = urlFor(ev);
    if (!url) { // no clip shipped — last-resort system voice
      speakSystem(ev.title + (ev.fact ? ". " + stripYears(ev.fact) : ""));
      return;
    }
    if (webAudioOK) {
      loadBuffer(url)
        .then(function (b) { playBuffer(b); })
        .catch(function () {
          // fetch/decode unavailable (file:// origin) — use the media element.
          webAudioOK = false;
          if (!playElement(url)) speakSystem(ev.title);
        });
    } else if (!playElement(url)) {
      speakSystem(ev.title);
    }
  }
  function warm(ev) {
    if (!webAudioOK) return;
    var url = urlFor(ev);
    if (!url || buffers[url]) return;
    loadBuffer(url).catch(function () {});
  }

  // --- public API --------------------------------------------------------------
  function cancelPendingSpeak() {
    if (pendingSpeakTimer) { clearTimeout(pendingSpeakTimer); pendingSpeakTimer = 0; }
  }
  var Narrator = {
    isEnabled: function () { return enabled; },
    setDeck: function (d) { deck = d || null; },
    setEnabled: function (on) {
      enabled = !!on;
      writeLS(LS_ENABLED, enabled ? "1" : "0");
      if (!enabled) Narrator.stop();
      syncControls();
    },
    // Speak the card that is on screen (called on every card load).
    // opts.delay (ms) defers playback — used for the first card of a game so
    // the voice starts after the curtain has finished transitioning in.
    speakEvent: function (ev, opts) {
      if (!enabled || !ev || !ev.id) return;
      cancelPendingSpeak();
      var delay = opts && opts.delay > 0 ? opts.delay : 0;
      if (delay) {
        pendingSpeakTimer = setTimeout(function () {
          pendingSpeakTimer = 0;
          play(ev);
        }, delay);
        return;
      }
      play(ev);
    },
    // Warm the next few clips so their playback is instant.
    prefetch: function (events) {
      if (!enabled || !events || !events.length) return;
      events.slice(0, PREFETCH_AHEAD).forEach(warm);
    },
    stop: function () {
      cancelPendingSpeak();
      stopPlayback();
      if ("speechSynthesis" in window) { try { speechSynthesis.cancel(); } catch (e) {} }
    },
    test: function () {
      if (!enabled) Narrator.setEnabled(true);
      var files = deck && deck.narration && deck.narration.files;
      var firstId = files ? Object.keys(files)[0] : null;
      if (firstId) play({ id: firstId });
      else speakSystem("Narration is ready. Stories last for thousands of years.");
    },
    unlock: unlock,
    syncControls: syncControls,
  };
  window.Narrator = Narrator;

  // --- settings UI -------------------------------------------------------------
  function syncControls() {
    var btn = $("narration-btn");
    if (btn) {
      btn.textContent = enabled ? "🔊 On" : "🔇 Off";
      btn.setAttribute("aria-pressed", enabled ? "true" : "false");
    }
    var status = $("narration-status");
    if (status) {
      var voice = deck && deck.narration && deck.narration.voice;
      status.textContent = enabled
        ? (voice ? "On · Kokoro · " + voice : "On")
        : "Off";
    }
  }

  function boot() {
    // On by default — the game's core learning feature, and consistent with
    // music (which also defaults on). A stored preference always wins.
    enabled = readLS(LS_ENABLED, "1") === "1";
    var btn = $("narration-btn");
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      unlock(); // this is a user gesture — unlock audio here
      Narrator.setEnabled(!enabled);
      if (enabled) Narrator.test();
    });
    var tbtn = $("narration-test");
    if (tbtn) tbtn.addEventListener("click", function () { unlock(); Narrator.test(); });
    syncControls();
    // One-time unlock on the first interaction anywhere.
    var once = function () { unlock(); document.removeEventListener("pointerdown", once); document.removeEventListener("keydown", once); };
    document.addEventListener("pointerdown", once);
    document.addEventListener("keydown", once);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
