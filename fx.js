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
    // Structure: titleEl (flex-centered, drift target) > span (the text).
    // The span is measured and font-fitted per transition so long deck names
    // never overflow narrow (mobile) viewports.
    let titleEl = null;
    let titleDrift = null;
    if (titleText) {
      titleEl = document.createElement("div");
      titleEl.style.cssText =
        "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
        "will-change:transform;";
      const span = document.createElement("span");
      span.textContent = titleText;
      span.style.cssText =
        "font-weight:800;line-height:1;font-size:clamp(2rem,10vw,4rem);" +
        "letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;" +
        "color:rgba(255,255,255,.18);";
      titleEl.appendChild(span);
      c.appendChild(titleEl);

      // Fit-to-width: scale the font until the line fits 84% of the viewport
      // (84% + the ±3vw drift stay inside the panel at any width). A single
      // proportional pass undershoots — glyph advance rounding makes text
      // relatively wider at smaller sizes — so measure, scale, and re-measure
      // (max 3 passes, 2% headroom per pass). Floor at 15px; ellipsis is the
      // safety net for pathological names.
      const maxW = W * 0.84;
      let fs = parseFloat(getComputedStyle(span).fontSize);
      for (let i = 0; i < 3; i++) {
        const w = span.getBoundingClientRect().width;
        if (w <= maxW) break;
        fs = Math.max(15, fs * (maxW / w) * 0.98);
        span.style.fontSize = fs.toFixed(1) + "px";
      }
      span.style.maxWidth = maxW + "px";
      span.style.overflow = "hidden";
      span.style.textOverflow = "ellipsis";

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

  // ---- juice primitives -------------------------------------------
  // Small compositor-driven feedback effects. All gate on motionOn() and use
  // native element.animate (transform/opacity are composited) so they stay
  // time-locked even when the main thread is busy (glass init, rebuilds).
  // Research-backed: particles = strongest perceived feedback modality;
  // floating text = most reliable information channel; vignette = peripheral
  // (felt more than seen); all color-coded per the Juice Audit's colour
  // language (green = good, red = bad).

  // Scale pop with a springy overshoot (lock-in feel).
  function pop(el, scale = 1.15, ms = 300) {
    if (!el || !motionOn()) return;
    el.animate(
      [
        { transform: "scale(1)" },
        { transform: `scale(${scale})`, offset: 0.45 },
        { transform: "scale(0.96)", offset: 0.8 },
        { transform: "scale(1)" },
      ],
      { duration: ms, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" }
    );
  }

  // Radial particle burst from an element's center (DOM particles, one-shot).
  function burst(el, opts = {}) {
    if (!el || !motionOn()) return;
    const count = opts.count || 10;
    const colors = opts.colors || ["#6ea8fe", "#8b7bff", "#4ade80", "#f8b26a"];
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    for (let i = 0; i < count; i++) {
      const size = 4 + Math.random() * 4;
      const p = document.createElement("div");
      p.style.cssText =
        `position:fixed;left:${cx - size / 2}px;top:${cy - size / 2}px;` +
        `width:${size}px;height:${size}px;border-radius:50%;` +
        `background:${colors[i % colors.length]};pointer-events:none;z-index:9997;`;
      document.body.appendChild(p);
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
      const dist = 40 + Math.random() * 55;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const anim = p.animate(
        [
          { transform: "translate(0,0) scale(1)", opacity: 1 },
          { transform: `translate(${dx}px,${dy}px) scale(0.15)`, opacity: 0 },
        ],
        { duration: 450 + Math.random() * 250, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
      );
      anim.finished.then(() => p.remove()).catch(() => p.remove());
    }
  }

  // Floating score text that rises and fades above an element.
  function floatText(el, text, opts = {}) {
    if (!el || !motionOn()) return;
    const r = el.getBoundingClientRect();
    const t = document.createElement("div");
    t.textContent = text;
    t.style.cssText =
      `position:fixed;left:${r.left + r.width / 2}px;top:${r.top}px;` +
      `transform:translate(-50%,-50%);font-weight:800;` +
      `font-size:${opts.size || 1.15}rem;color:${opts.color || "#4ade80"};` +
      `text-shadow:0 2px 10px rgba(0,0,0,.55);pointer-events:none;z-index:9997;` +
      `white-space:nowrap;`;
    document.body.appendChild(t);
    const anim = t.animate(
      [
        { transform: "translate(-50%,-50%)", opacity: 0 },
        { transform: "translate(-50%,-120%)", opacity: 1, offset: 0.2 },
        { transform: "translate(-50%,-170%)", opacity: 0 },
      ],
      { duration: 900, easing: "ease-out" }
    );
    anim.finished.then(() => t.remove()).catch(() => t.remove());
  }

  // Full-viewport vignette pulse (peripheral feedback, color-coded).
  let vignetteEl = null;
  function vignette(color, ms = 260) {
    if (!motionOn()) return;
    if (!vignetteEl) {
      vignetteEl = document.createElement("div");
      vignetteEl.style.cssText =
        "position:fixed;inset:0;pointer-events:none;z-index:9996;opacity:0;";
      document.body.appendChild(vignetteEl);
    }
    vignetteEl.style.boxShadow = `inset 0 0 130px 45px ${color}`;
    vignetteEl.animate(
      [
        { opacity: 0 },
        { opacity: 1, offset: 0.25 },
        { opacity: 0 },
      ],
      { duration: ms, easing: "ease-out" }
    );
  }

  // Graded confetti celebration (canvas-confetti vendored; no-op if missing).
  // z-index 9997: below the curtain (9998), above content.
  function confetti(opts = {}) {
    if (!motionOn() || typeof window.confetti !== "function") return;
    const c = window.confetti;
    const z = 9997;
    if (opts.tier === "heavy") {
      c({ particleCount: 180, spread: 120, origin: { y: 0.6 }, zIndex: z });
      setTimeout(() => c({ particleCount: 90, spread: 90, angle: 60, origin: { y: 0.55 }, zIndex: z }), 250);
      setTimeout(() => c({ particleCount: 90, spread: 90, angle: 120, origin: { y: 0.55 }, zIndex: z }), 420);
    } else {
      c({ particleCount: 80, spread: 80, origin: { y: 0.6 }, zIndex: z });
    }
  }

  // ---- rail extension (timeline line grows to a newly placed node) ----
  // The rail is a pseudo-element (.timeline::before) positioned by the
  // --rail-top/--rail-bottom custom properties. anime.js v4 animates CSS
  // variables directly (docs: "enables animation of properties defined on
  // pseudo-elements like ::after and ::before"), so we pass the variable
  // names as string keys — no proxy object needed. The CSS transition on
  // the pseudo-element is disabled for the duration so it can't fight the
  // per-frame writes; it is restored on completion. Reduced motion / FX
  // off: jump straight to the new bounds.
  let railStyleInjected = false;
  let railAnimSeq = 0;
  function railExtend(tl, from, to, opts = {}) {
    if (!tl) return;
    const ms = opts.duration || 600;
    if (!motionOn()) {
      tl.style.setProperty("--rail-top", to.top.toFixed(1) + "px");
      tl.style.setProperty("--rail-bottom", to.bottom.toFixed(1) + "px");
      return;
    }
    if (!railStyleInjected) {
      const s = document.createElement("style");
      s.textContent = ".timeline--rail-animating::before { transition: none !important; }";
      document.head.appendChild(s);
      railStyleInjected = true;
    }
    const seq = ++railAnimSeq;
    tl.classList.add("timeline--rail-animating");
    animate(tl, {
      "--rail-top": [from.top.toFixed(1) + "px", to.top.toFixed(1) + "px"],
      "--rail-bottom": [from.bottom.toFixed(1) + "px", to.bottom.toFixed(1) + "px"],
      duration: ms,
      ease: opts.ease || "outCubic",
      onComplete: () => {
        if (seq !== railAnimSeq) return; // superseded by a newer extension
        tl.classList.remove("timeline--rail-animating");
      },
    });
  }

  // ---- rail glow (energy travels outward from a newly placed node) ----
  // On every correct placement a bright streak appears at the new card's
  // node and splits, traveling up and down the rail to both ends while
  // fading out — the line "lights up" from the placed item. Native WAAPI
  // (transform + opacity are composited) so it stays time-locked even while
  // the timeline rebuilds. Reduced motion / FX off: no-op.
  const RAIL_GLOW_MS = 700;
  function railGlow(tl, cardEl, opts = {}) {
    if (!tl || !cardEl || !motionOn()) return;
    const delay = opts.delay || 40;
    const color = opts.color || "110, 168, 254"; // --accent blue
    const r = cardEl.getBoundingClientRect();
    const nodeY = r.top + r.height / 2;
    const tlRect = tl.getBoundingClientRect();
    const railX = tlRect.left + 8; // rail center: left:7px + 1px half-width
    const railTopY = tlRect.top + (parseFloat(tl.style.getPropertyValue("--rail-top")) || 0);
    const railBottomY = tlRect.bottom - (parseFloat(tl.style.getPropertyValue("--rail-bottom")) || 0);
    const upDist = railTopY - nodeY;
    const downDist = railBottomY - nodeY;
    if (Math.abs(upDist) < 2 && Math.abs(downDist) < 2) return; // nothing to travel

    const make = () => {
      const g = document.createElement("div");
      g.dataset.railGlow = "1";
      g.style.cssText =
        `position:fixed;left:${railX - 3}px;top:${nodeY - 7}px;` +
        `width:6px;height:14px;border-radius:999px;pointer-events:none;z-index:9996;` +
        `background:radial-gradient(closest-side, rgba(255,255,255,0.95), rgba(${color},0.55) 55%, rgba(${color},0));` +
        `box-shadow:0 0 10px 3px rgba(${color},0.55);will-change:transform,opacity;`;
      document.body.appendChild(g);
      return g;
    };
    const travel = (el, dist) => {
      const anim = el.animate(
        [
          { transform: "translateY(0px)", opacity: 0.95 },
          { transform: `translateY(${dist.toFixed(1)}px)`, opacity: 0 },
        ],
        { duration: RAIL_GLOW_MS, easing: "cubic-bezier(0.16, 1, 0.3, 1)", delay }
      );
      anim.finished.then(() => el.remove()).catch(() => el.remove());
    };
    if (Math.abs(upDist) >= 2) travel(make(), upDist);
    if (Math.abs(downDist) >= 2) travel(make(), downDist);
  }

  // ---- focus scale (scroll-linked scale falloff) --------------------
  // Items nearest the viewport's vertical centre render slightly larger and
  // ease back to native size at the top/bottom edges — a "you are here" depth
  // cue, not a readability aid.
  //
  // Scale-only, never rotation: isotropic scale preserves glyph shape (the
  // 3D-carousel legibility penalty comes from foreshortened rotation), and
  // because transform does not affect flow, the layout never reflows — scroll
  // length, drop targets and any rail stay put. Transform an INNER wrapper,
  // not the scroll item, so the item's box (and everything positioned against
  // it — nodes, connectors, popovers) is untouched.
  //
  // Falloff is a raised cosine (Hann): w(0)=1, w(±1)=0, zero slope at both
  // ends — a stable 2-3 item plateau instead of a single jumpy peak. `peak`
  // and `edge` are the scales at the viewport centre and at the top/bottom
  // threshold (e.g. 1.025 / 0.975); both default to 1 for a grow-only effect.
  // (Research: 1.03-1.08 reads as subtle; >1.15 aggressive.)
  //
  // Reduced motion / FX off: flattened to native size, content stays visible
  // (scroll-linked scale is a vestibular trigger — WCAG 2.3.3 / MDN flags
  // zoom animations). Reads the preference at call time, never cached.
  //
  // Layout-neutral by design: measure() is the only layout read and it caches
  // document-space centres once; the per-frame path reads scrollY only and
  // writes transform only. Returns a controller: refresh() after the list is
  // rebuilt, destroy() to remove listeners and clear inline styles.
  function focusScale(list, opts = {}) {
    if (!list) return null;
    const peak = opts.peak != null ? opts.peak : 1.05;  // scale at the viewport centre
    const edge = opts.edge != null ? opts.edge : 1;     // scale at the top/bottom threshold
    const sharp = opts.sharp != null ? opts.sharp : 1;  // falloff exponent: >1 = peakier
    const minOpacity = opts.minOpacity != null ? opts.minOpacity : 1; // opacity at the threshold
    // Profile shape:
    //   "sphere" — constant-curvature dome (parabolic sagitta). A broad, evenly
    //              curved arc like a patch of a large sphere: no flat top, no
    //              sharp peak, so it reads as curvature rather than a highlight.
    //   "cosine" — raised cosine (Hann). Gentler: plateaus at the centre and
    //              flattens at the ends.
    const curve = opts.curve === "sphere" ? "sphere" : "cosine";
    const origin = opts.origin || "center center";
    // Optional: publish each item's current scale as a CSS custom property on
    // its parent, so sibling/decoration CSS can track the transformed box (e.g.
    // a connector stub that must always meet the card's visual edge). Skipped
    // when the item IS a direct child of the list (nothing to publish to).
    const scaleVar = opts.scaleVar || null;
    const selector = opts.selector || null;
    const disabledWhen = typeof opts.disabledWhen === "function" ? opts.disabledWhen : null;

    let items = [];
    let centers = [];   // document-space vertical centres (valid across scroll:
                        // transforms never reflow, so they cannot shift)
    let ticking = false;
    let rafId = 0;
    let lifted = -1;    // index currently promoted with z-index

    function collect() {
      items = selector
        ? Array.prototype.slice.call(list.querySelectorAll(selector))
        : Array.prototype.filter.call(list.children, (n) => n.nodeType === 1);
    }

    function clearAll() {
      for (const el of items) {
        el.style.transform = ""; el.style.zIndex = ""; el.style.transformOrigin = "";
        el.style.opacity = "";
        if (scaleVar && el.parentElement && el.parentElement !== list) {
          el.parentElement.style.removeProperty(scaleVar);
        }
      }
      lifted = -1;
    }

    function measure() {
      collect();
      // Batch-write: drop any live scale BEFORE reading rects (a transform
      // would otherwise be measured), then batch-read in one reflow.
      for (const el of items) {
        el.style.transform = "";
        if (!el.style.transformOrigin) el.style.transformOrigin = origin;
      }
      const sy = window.scrollY || window.pageYOffset || 0;
      centers = items.map((el) => {
        const r = el.getBoundingClientRect();
        return sy + r.top + r.height / 2;
      });
    }

    function paint() {
      ticking = false;
      if (!items.length) return;
      if (!motionOn() || (disabledWhen && disabledWhen())) { clearAll(); return; }

      const H = window.innerHeight || document.documentElement.clientHeight;
      const half = (H / 2) || 1;
      const vCenter = (window.scrollY || window.pageYOffset || 0) + half;

      let best = -1, bestW = -1;
      for (let i = 0; i < items.length; i++) {
        let d = (centers[i] - vCenter) / half;
        if (d < -1) d = -1; else if (d > 1) d = 1;
        const w = curve === "sphere"
          ? Math.max(0, 1 - d * d)                    // parabolic sagitta → constant curvature
          : 0.5 * (1 + Math.cos(Math.PI * d));        // raised cosine
        const ws = sharp === 1 ? w : Math.pow(w, sharp); // sharpened → peakier centre
        const s = edge + (peak - edge) * ws;         // peak at centre, edge at the threshold
        const next = Math.abs(s - 1) > 0.0005 ? "scale(" + s.toFixed(4) + ")" : "";
        if (items[i].style.transform !== next) items[i].style.transform = next;
        if (minOpacity < 1) {
          // Fade tracks the un-smoothed falloff so the edge dims without the
          // steeper drop of the sharpened scale — coordinated, not identical.
          const o = minOpacity + (1 - minOpacity) * w;
          const ov = o < 0.9995 ? o.toFixed(3) : "";
          if (items[i].style.opacity !== ov) items[i].style.opacity = ov;
        }
        if (scaleVar) {
          const host = items[i].parentElement;
          if (host && host !== list) host.style.setProperty(scaleVar, s.toFixed(4));
        }
        if (w > bestW) { bestW = w; best = i; }
      }
      // Lift only the centred card above its neighbours. z-index is not a
      // compositor property, so write it only when the centre changes — not
      // every frame, which would invite flicker.
      if (best !== lifted) {
        if (lifted >= 0 && items[lifted]) items[lifted].style.zIndex = "";
        if (best >= 0 && items[best]) items[best].style.zIndex = "2";
        lifted = best;
      }
    }

    function schedule() {
      if (ticking) return;
      ticking = true;
      rafId = requestAnimationFrame(paint);
    }

    function onResize() { measure(); schedule(); }

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    if (mq.addEventListener) mq.addEventListener("change", schedule);

    measure();
    schedule();

    return {
      refresh() { measure(); schedule(); },
      destroy() {
        window.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", onResize);
        if (mq.removeEventListener) mq.removeEventListener("change", schedule);
        if (rafId) cancelAnimationFrame(rafId);
        clearAll();
        items = []; centers = [];
      },
    };
  }

  // ---- public API ----------------------------------------------------
  window.FX = {
    get enabled() { return getFxOn(); },
    setEnabled(on) { setFxOn(!!on); },
    curtain,
    shake,
    scoreCount,
    pop,
    burst,
    floatText,
    vignette,
    confetti,
    railExtend,
    railGlow,
    focusScale,
  };
})();
