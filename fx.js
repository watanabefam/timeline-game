/* ==================================================================
   fx.js — interface effects layer (anime.js v4 UMD, MIT)
   ------------------------------------------------------------------
   Exposes window.FX. Loaded after assets/vendor/anime.umd.min.js and
   before timeline.js. Self-contained: inline styles, no CSS edits.

   Research-backed parameters:
   - Curtain: Motion clipWipe architecture — static full-viewport panel,
     slanted edge animated via clip-path on the WAAPI engine (compositor-
     driven: immune to main-thread work), destination title painted on the
     panel drifting slowly. Cover 260ms / reveal 340ms; the screen swap and
     glass init run in the static-full gap between phases. A one-time
     warm-up primes engines/shaders at load.
     Reduced motion -> 200ms opacity-only crossfade (no displacement).
   - Shake: 4px / 200ms, positional X only, decaying, no overshoot
     (Xbox XAG 117 / vestibular-safe motion guidance).
   - Reduced motion is read AT CALL TIME (users toggle mid-session),
     never cached at module load.
   ================================================================== */
(function () {
  "use strict";
  if (!window.anime) return; // vendor missing -> graceful no-op

  const { animate, waapi } = window.anime;

  // ---- preferences -------------------------------------------------
  const FX_KEY = "timeline.fx"; // "on" | "off" (default on)
  function getFxOn() {
    try { return localStorage.getItem(FX_KEY) !== "off"; } catch (_) { return true; }
  }
  function setFxOn(on) {
    try { localStorage.setItem(FX_KEY, on ? "on" : "off"); } catch (_) {}
  }
  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  // Master gate: user toggle AND OS preference.
  function motionOn() { return getFxOn() && !reducedMotion(); }

  // ---- curtain (cover-then-reveal screen transition) ---------------
  // Motion clipWipe architecture (titledClipWipe pattern): a STATIC
  // full-viewport panel whose slanted edge is an animated clip-path —
  // "the overlay itself never moves". The destination title is painted on
  // the panel and drifts slowly while the edges sweep over it.
  // - Forward: edge sweeps left→right, top leans right.
  // - Backward: edge sweeps right→left, top leans left.
  const COVER_MS = 260, REVEAL_MS = 340;
  const SLANT_DEG = 7;        // "slightly diagonal"
  const TITLE_DRIFT_VW = 6;   // total slow drift of the title across the panel
  let curtainBusy = false;
  let queuedCurtain = null; // latest navigation wins; never drop a screen change

  function curtain(swapFn, opts = {}) {
    if (typeof swapFn !== "function") return Promise.resolve();
    if (curtainBusy) {
      queuedCurtain = { swapFn, opts };
      return Promise.resolve();
    }
    const forward = opts.direction !== "backward";
    const titleText = typeof opts.title === "string" ? opts.title.trim() : "";

    // Reduced motion / FX off: instant swap + short non-directional fade.
    // (Opacity is not a vestibular trigger; keeps the "screen changed" signal.)
    // Native WAAPI: opacity is composited — time-locked like the curtain.
    if (!motionOn()) {
      swapFn();
      const entering = document.querySelector(".screen:not(.hidden)");
      if (entering) {
        entering.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
      }
      return Promise.resolve();
    }

    curtainBusy = true; // ignore re-entry while pending (Motion's isPending pattern)

    // Slant offset in px, measured from the box (per Motion: size effects
    // from the measured box, not assumptions). tan(angle) × height.
    const W = window.innerWidth;
    const S = Math.tan((SLANT_DEG * Math.PI) / 180) * window.innerHeight;

    // Static panel — the clip-path IS the curtain.
    const c = document.createElement("div");
    c.style.cssText =
      "position:fixed;inset:0;z-index:9998;background:var(--bg,#0d1320);" +
      "overflow:hidden;will-change:clip-path;pointer-events:auto;";
    document.body.appendChild(c);

    // Title painted on the panel — clipped by the animated clip-path, so it
    // is revealed by the leading edge and wiped away by the trailing edge.
    let titleEl = null;
    let titleDrift = null;
    if (titleText) {
      titleEl = document.createElement("div");
      titleEl.textContent = titleText;
      titleEl.style.cssText =
        "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
        "font-weight:800;line-height:1;font-size:clamp(2rem,10vw,4rem);" +
        "letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;" +
        "color:rgba(255,255,255,.18);will-change:transform;";
      c.appendChild(titleEl);
      // Slow constant glide in the sweep direction, over the whole run.
      // px numbers (not vw strings): anime.js's WAAPI `x` shorthand drops
      // unit-string keyframes — the animation then runs but applies nothing.
      const d = (forward ? -1 : 1) * (TITLE_DRIFT_VW / 100) * W;
      titleDrift = [Math.round(d), Math.round(-d)];
      // Inline hold = END value, set BEFORE the animation starts. Writing the
      // inline transform AFTER starting a WAAPI animation kills its effect
      // (anime.js's WAAPI transform engine re-resolves on inline style writes).
      // During play the animation overrides the inline; on finish the inline
      // holds the drift end (no fill-mode needed, no revert flash).
      titleEl.style.transform = "translateX(" + titleDrift[1] + "px)";
    }

    // Clip-path keyframes (all-px, identical 4-point structure so anime.js
    // can interpolate). The edge = slanted line between point 2 (top) and
    // point 4 (bottom); top leads the bottom toward the sweep direction.
    let coverFrom, coverTo, revealFrom, revealTo;
    if (forward) {
      // Cover: panel = left of edge; edge travels 0 → past right.
      coverFrom  = `polygon(0px 0%, 0px 0%, ${-S}px 100%, 0px 100%)`;
      coverTo    = `polygon(0px 0%, ${W + S}px 0%, ${W}px 100%, 0px 100%)`;
      // Reveal: panel = right of edge; trailing edge travels 0 → past right.
      revealFrom = `polygon(0px 0%, ${W}px 0%, ${W}px 100%, ${-S}px 100%)`;
      revealTo   = `polygon(${W + S}px 0%, ${W}px 0%, ${W}px 100%, ${W}px 100%)`;
    } else {
      // Mirror: cover = panel right of edge travelling right→left;
      // reveal = panel left of edge.
      coverFrom  = `polygon(${W}px 0%, ${W}px 0%, ${W}px 100%, ${W + S}px 100%)`;
      coverTo    = `polygon(${-S}px 0%, ${W}px 0%, ${W}px 100%, 0px 100%)`;
      revealFrom = `polygon(0px 0%, ${W}px 0%, ${W + S}px 100%, 0px 100%)`;
      revealTo   = `polygon(0px 0%, ${-2 * S}px 0%, ${-S}px 100%, 0px 100%)`;
    }
    c.style.clipPath = coverFrom; // no flash before the first tick

    // WAAPI engine (compositor-driven): the panel clip-path and the title
    // drift animate on the GPU timeline, so the synchronous swap + glass
    // init at cover-end cannot stall them. Inline state-holds are set
    // immediately after starting each phase — the running animation masks
    // them, and they hold the final state the instant it completes (no
    // fill-mode dependency, no revert flash).
    return new Promise(async (resolve) => {
      const coverAnim = waapi.animate(c, {
        clipPath: [coverFrom, coverTo], duration: COVER_MS, ease: "outQuad",
      });
      c.style.clipPath = coverTo; // masked while animating; holds on finish
      // Native WAAPI for the title: anime.js's waapi `x` shorthand animates a
      // proxy object and writes the DOM transform from JS each frame (main-
      // thread — stalls under load). Native element.animate on `transform`
      // is compositor-driven and glides through the swap + glass init.
      // The inline hold (end value) was set at creation; the running
      // animation overrides it, and it holds the drift end on finish.
      const titleAnim = titleEl
        ? titleEl.animate(
            [
              { transform: "translateX(" + titleDrift[0] + "px)" },
              { transform: "translateX(" + titleDrift[1] + "px)" },
            ],
            { duration: COVER_MS + REVEAL_MS, easing: "linear" },
          )
        : null;
      // (title inline hold was set before start — see title creation above;
      // do NOT write title transforms after this point while it animates.)

      await coverAnim; // curtain fully covers — compositor keeps the title gliding

      // Swap + glass init: synchronous main-thread work while the curtain is
      // static-full. Nothing is animating on the main thread here, so this
      // cannot stutter the reveal.
      swapFn();

      const revealAnim = waapi.animate(c, {
        clipPath: [revealFrom, revealTo], duration: REVEAL_MS, ease: "inQuad",
      });
      c.style.clipPath = revealTo; // masked while animating; holds on finish
      await revealAnim;

      c.remove();
      curtainBusy = false;
      resolve();
      // Run a navigation that arrived mid-curtain (latest wins).
      if (queuedCurtain) {
        const q = queuedCurtain;
        queuedCurtain = null;
        curtain(q.swapFn, q.opts);
      }
    });
  }

  // ---- one-time warm-up ---------------------------------------------
  // First-run jank comes from engine init + compositor shader compilation
  // (clip-path) + layer promotion. Prime all of it on a throwaway offscreen
  // element right after load, so the first real curtain is already smooth.
  function warmUp() {
    try {
      const w = document.createElement("div");
      w.style.cssText =
        "position:fixed;left:-9999px;top:0;width:12px;height:12px;" +
        "will-change:clip-path,transform;pointer-events:none;";
      document.body.appendChild(w);
      const a = waapi.animate(w, {
        clipPath: [
          "polygon(0px 0%, 0px 0%, 0px 100%, 0px 100%)",
          "polygon(12px 0%, 12px 0%, 12px 100%, 0px 100%)",
        ],
        duration: 60, ease: "linear",
      });
      // Native WAAPI for the transform warm-up (compositor path — same
      // engine the title drift uses).
      const b = w.animate(
        [{ transform: "translateX(0px)" }, { transform: "translateX(12px)" }],
        { duration: 60, easing: "linear" },
      );
      Promise.allSettled([a, b.finished]).then(() => w.remove());
    } catch (_) {}
    // Prime the JS engine too (reduced-motion crossfade, shake, score count).
    try { animate({ v: 0 }, { v: 1, duration: 16 }); } catch (_) {}
  }
  if (document.readyState === "complete") setTimeout(warmUp, 50);
  else window.addEventListener("load", () => setTimeout(warmUp, 50), { once: true });

  // ---- shake (wrong-answer punctuation) ----------------------------
  // Short, positional, decaying spike — never rotational, never sustained.
  // Native WAAPI: transform is composited, so the shake stays time-locked
  // even if the main thread is busy (glass init, timeline rebuild). No
  // inline styles are written — the transform reverts automatically on
  // finish, so no containing-block cleanup is needed.
  let shakeAnim = null;
  function shake(el, intensity = 4, ms = 200) {
    if (!el || !motionOn()) return;
    if (shakeAnim) { try { shakeAnim.cancel(); } catch (_) {} }
    // Decaying alternating offsets: spike up front, gentle settle, end at 0.
    const steps = 6, frames = [];
    for (let i = 0; i < steps; i++) {
      const dir = i % 2 ? 1 : -1;
      frames.push({ transform: "translateX(" + (dir * intensity * (1 - i / steps)).toFixed(2) + "px)" });
    }
    frames.push({ transform: "translateX(0px)" });
    shakeAnim = el.animate(frames, { duration: ms, easing: "ease-out" });
  }

  // ---- score count-up ----------------------------------------------
  // Animates a plain object (guaranteed-safe v4 target) and writes the
  // rounded value to the element each tick.
  function scoreCount(el, to, ms = 600) {
    if (!el) return;
    const from = parseInt(el.textContent, 10) || 0;
    to = Math.round(to) || 0;
    if (!motionOn() || from === to) { el.textContent = String(to); return; }
    const obj = { v: from };
    animate(obj, {
      v: to,
      duration: ms,
      ease: "outExpo",
      onUpdate: () => { el.textContent = String(Math.round(obj.v)); },
    });
  }

  // ---- public API ----------------------------------------------------
  window.FX = {
    get enabled() { return getFxOn(); },
    setEnabled(on) { setFxOn(!!on); },
    curtain,
    shake,
    scoreCount,
  };
})();
