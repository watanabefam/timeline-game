#!/usr/bin/env node
/*
 * tools/offline-smoke/feedback.mjs
 * ------------------------------------------------------------------
 * The A8 feedback + pre-reveal confidence slice (GAMIFICATION_BRIEF §11 phase 4,
 * doc/FEEDBACK_CONFIDENCE_PLAN.md) — 4a (a one-line why at the slip reveal),
 * 4b (one predirected pre-reveal prompt per round), 4c (the optional
 * `confidence` field on the append-only row) and 4d (no mastery % on the focus
 * panel for 5–7). Run with:
 *
 *   npm --prefix tools/offline-smoke install   # once (downloads Chrome)
 *   node tools/offline-smoke/feedback.mjs
 *
 * Why it exists: the band gate, the prompt DOM, the reveal copy and the field
 * written to localStorage are a copy + DOM + persistence contract with no
 * Node-testable half (the pure half — promptPlan / attachConfidence / the latch
 * — is covered by scripts/test/prompt-plan.test.mjs), so it needs a browser.
 *
 * What it exercises, in a real Chromium, against a real read-only HTTP server:
 *   1. 17+: the prompt renders on the round's first card, BEFORE any placement
 *      (only the anchors are on the timeline), with the predirected cue
 *   2. answering writes EXACTLY ONE `confidence` row, and it is the answer given
 *   3. skipping writes NO `confidence` field at all (absence is meaningful, §6)
 *   4. 5–7: the prompt never renders, and no confidence row is written
 *   5. 8–11: the prompt renders, but as the simple self-check (no predirected cue)
 *   6. 4a: a card that took a slip carries a `.tl-why` at its reveal, whose text
 *      is the event's `why`
 *   7. 4d: a 5–7 profile's focus-panel week rows show stars and no percentage,
 *      while 17+ still shows the percentage
 *   8. reduced motion: the prompt still renders and is answerable
 *   9. no page or console errors along the way
 *
 * The round is played by clicking the first gap repeatedly — a wrong slot loops
 * until the rescue reveals the answer, then the next click places it — so the
 * run reaches the results screen (the only point the review log is written)
 * without needing to know the deck's chronology. That is enough for the data
 * contract; it does NOT verify scoring or the exact ordering of a round.
 *
 * Every profile is SEEDED into localStorage (the app reads it at boot); this
 * harness never mutates the repo and serves the tracked files read-only.
 *
 * Author-time tooling, never shipped (AGENTS.md rule 1 scope note), and
 * deliberately NOT part of `npm test` (it needs a browser download).
 *
 * NOT covered here, and never claimed: iOS Safari, how any of it LOOKS (this is
 * a DOM/state check), the direction the prompt's wording helps learning (that is
 * a playtest question — the plan carries the falsifier), and print output.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, dirname, resolve as resolvePath, sep } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? `\n      ${detail}` : ""}`);
};
const note = (name, detail = "") => {
  console.log(`  · ${name}${detail ? `\n      ${detail}` : ""}`);
};
const started = Date.now();
let lastMark = started;
const phase = (title) => {
  const now = Date.now();
  console.log(`\n── ${title}  [+${((now - lastMark) / 1000).toFixed(1)}s, total ${((now - started) / 1000).toFixed(1)}s]`);
  lastMark = now;
};

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".woff2": "font/woff2",
  ".txt": "text/plain",
};

/* ------------------------------------------------------------- server */
let server = null;
const openServer = (port) =>
  new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      let p;
      try {
        p = decodeURIComponent(new URL(req.url, "http://x/").pathname);
      } catch {
        res.writeHead(400); res.end("bad request"); return;
      }
      if (p.endsWith("/")) p += "index.html";
      const file = resolvePath(root, "." + p);
      if (!file.startsWith(root + sep) || !existsSync(file) || statSync(file).isDirectory()) {
        res.writeHead(404); res.end("not found"); return;
      }
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
      res.end(readFileSync(file));
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server.address().port));
  });
const closeServer = () =>
  new Promise((resolve) => { if (!server) return resolve(); const s = server; server = null; s.close(() => resolve()); });

/* ------------------------------------------------- seeded profile */
const DECK_ID = "cc-timeline";
const USER_ID = "smoke-feedback";
const deck = JSON.parse(readFileSync(join(root, "decks", DECK_ID, "deck.json"), "utf8"));
const whyOf = new Map(deck.events.map((e) => [e.id, e.why || ""]));

// A log engineered so the reach-back scheduler serves a due set for both the
// ungated bands and the 5–7 era/week block (the same shape review.mjs uses), so
// every band can actually start a Review round and reach the prompt.
const row = (eventId) => ({ ts: 1700000000000, deck: DECK_ID, eventId, outcome: "firstTry", mode: "free" });
const DUE_LOG = [
  "cc-001", "cc-004", "cc-005", "cc-006", "cc-007", "cc-008",
  "cc-049", "cc-074", "cc-087",
  "cc-002", "cc-003",
  "cc-009",
].map(row);

// placements >= 3 so the focus panel actually shows week rows (the 4d surface).
const eventState = (ids) => Object.fromEntries(ids.map((id) => [id, { placements: 3, slips: 1, firstTry: 2 }]));
const profile = (reviewLog, eventIds) => ({
  decks: {
    [DECK_ID]: {
      totals: { runs: 3, totalScore: 12, totalMax: 24, perfectRuns: 0, totalPlacements: 12, totalSlips: 6 },
      events: eventState(eventIds),
      runs: [],
    },
  },
  reviewLog,
  meta: { tz: "UTC" },
});
const seed = (band) => {
  const user = { id: USER_ID, name: "Smoke Feedback", createdAt: 1700000000000, hue: 120 };
  if (band) user.ageBand = band;
  return { users: [user], activeId: user.id };
};

/* ------------------------------------------------------------- pages */
async function openHome(browser, base, { band, reviewLog, eventIds, reducedMotion = false } = {}) {
  const context = await browser.createBrowserContext();
  const errs = [];
  const page = await context.newPage();
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  if (reducedMotion) {
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  }
  await page.evaluateOnNewDocument((users, prof, key) => {
    try {
      localStorage.setItem("timeline.users.v1", JSON.stringify(users));
      localStorage.setItem("timeline.user." + key + ".v1", JSON.stringify(prof));
    } catch (e) {}
  }, seed(band), profile(reviewLog, eventIds), USER_ID);

  await page.goto(base, { waitUntil: "load" });
  const reduced = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  await page.waitForSelector("#focus-panel .focus-card", { timeout: 20000 });
  return { context, page, errs, reduced };
}

/** Click the Focus panel's Review round card (if present) and wait for the game. */
async function startReview(page) {
  const clickable = await page.evaluate(() =>
    !!([...document.querySelectorAll("#focus-panel button.focus-card")].find((b) => /Review round/.test(b.textContent)))
  );
  if (clickable) {
    await page.evaluate(() =>
      [...document.querySelectorAll("#focus-panel button.focus-card")].find((b) => /Review round/.test(b.textContent)).click()
    );
  }
  let gameVisible = false;
  try {
    await page.waitForFunction(() => !document.getElementById("game").classList.contains("hidden"), { timeout: 20000 });
    gameVisible = true;
    await page.waitForSelector("#pane-1 .tl-title", { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 120));
  } catch (e) { /* recorded by the caller */ }
  return { clickable, gameVisible };
}

/** Read the pre-reveal prompt plus the reveal state, scoped to pane 1. */
const readPrompt = (page) =>
  page.evaluate(() => {
    const pane = document.getElementById("pane-1");
    const p = pane.querySelector(".tl-prompt");
    const q = (sel) => (p ? p.querySelector(sel) : null);
    return {
      present: !!p,
      cue: q(".tl-prompt-cue") ? q(".tl-prompt-cue").textContent.trim() : null,
      q: q(".tl-prompt-q") ? q(".tl-prompt-q").textContent.trim() : null,
      opts: p ? [...p.querySelectorAll(".tl-prompt-opt")].map((b) => b.dataset.confidence) : [],
      hasSkip: !!(p && p.querySelector(".tl-prompt-skip")),
      readyState: p ? p.getAttribute("role") : null,
      placedCards: pane.querySelectorAll(".tl-event").length,
    };
  });

async function answerPrompt(page, confidence) {
  await page.evaluate((c) => {
    const b = document.querySelector(`#pane-1 .tl-prompt-opt[data-confidence="${c}"]`);
    if (b) b.click();
  }, confidence);
  await new Promise((r) => setTimeout(r, 60));
}

async function skipPrompt(page) {
  await page.evaluate(() => {
    const b = document.querySelector("#pane-1 .tl-prompt-skip");
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 60));
}

/** Click the first gap until the results screen appears. Wrong slots loop. */
async function playRound(page, { maxClicks = 80 } = {}) {
  for (let i = 0; i < maxClicks; i++) {
    const done = await page.evaluate(() => !document.getElementById("results").classList.contains("hidden"));
    if (done) return i;
    await page.evaluate(() => {
      const gaps = document.querySelectorAll("#pane-1 .timeline .gap");
      if (gaps.length) gaps[0].click();
    });
    await new Promise((r) => setTimeout(r, 35));
  }
  return -1;
}

const readLog = (page) =>
  page.evaluate((id) => {
    let p = {};
    try { p = JSON.parse(localStorage.getItem("timeline.user." + id + ".v1") || "{}"); } catch (e) {}
    const log = Array.isArray(p.reviewLog) ? p.reviewLog : [];
    return {
      count: log.length,
      withConfidence: log.filter((r) => r && Object.prototype.hasOwnProperty.call(r, "confidence")),
      confidenceValues: log.filter((r) => r && "confidence" in r).map((r) => r.confidence),
      outcomes: log.map((r) => r.outcome),
    };
  }, USER_ID);

/** A completed round, returning the pieces the checks need. */
async function runRound(browser, base, opts, answerAction) {
  const { context, page, errs, reduced } = await openHome(browser, base, opts);
  const started = await startReview(page);
  const prompt = await readPrompt(page);
  const slippedWhy = [];
  if (answerAction === "sure") await answerPrompt(page, "sure");
  else if (answerAction === "skip") await skipPrompt(page);
  // Collect the reveal why-lines that appear during play (4a).
  const collect = setInterval(async () => {
    try {
      const lines = await page.$$eval("#pane-1 .tl-why", (els) => els.map((x) => x.textContent.trim()));
      lines.forEach((l) => { if (!slippedWhy.includes(l)) slippedWhy.push(l); });
    } catch (e) {}
  }, 60);
  const clicks = await playRound(page);
  clearInterval(collect);
  const promptGone = !(await readPrompt(page)).present;
  const log = await readLog(page);
  const atResults = await page.evaluate(() => !document.getElementById("results").classList.contains("hidden"));
  await context.close();
  return { started, prompt, promptGone, clicks, log, atResults, slippedWhy, errs, reduced };
}

/* ------------------------------------------------------------- main */
async function main() {
  const port = await openServer(0).then(async (p) => { await closeServer(); return p; });
  await openServer(port);
  const base = `http://127.0.0.1:${port}/`;
  console.log(`Serving the repo read-only at ${base}`);

  const browser = await puppeteer.launch({
    headless: true,
    // This smoke plays several full rounds, so the globe (three.js) creates and
    // tears down more WebGL contexts than the other smokes. Software WebGL must
    // be explicitly allowed or Chromium logs "A WebGL context could not be
    // created" — a headless-GPU artifact, not a game error.
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--enable-unsafe-swiftshader"],
  });

  const allErrors = [];
  try {
    /* ---- 1 & 2. 17+: prompt before the reveal; answer is stored once ---- */
    phase("1 · age band 17+ — the prompt fires before the reveal, and the answer is stored");
    const a = await runRound(browser, base, { band: "17+", reviewLog: DUE_LOG, eventIds: DUE_LOG.map((r) => r.eventId) }, "sure");
    allErrors.push(...a.errs);
    check("clicking Review round opened the game", a.started.clickable && a.started.gameVisible);
    check("the prompt renders on the first card", a.prompt.present, JSON.stringify(a.prompt));
    check("it renders BEFORE any placement — only the anchors are on the timeline",
      a.prompt.placedCards === 2, `placedCards=${a.prompt.placedCards}`);
    check("12+ gets the predirected cue and the confidence question",
      /before this one/i.test(a.prompt.cue || "") && /how sure/i.test(a.prompt.q || ""),
      `cue=<${a.prompt.cue}>, q=<${a.prompt.q}>`);
    check("it offers the two confidence answers and a skip",
      a.prompt.opts.join(",") === "sure,unsure" && a.prompt.hasSkip,
      `opts=${a.prompt.opts}, skip=${a.prompt.hasSkip}`);
    check("it is a labelled group for assistive tech", a.prompt.readyState === "group", `role=${a.prompt.readyState}`);
    check("the round reached the results screen (the log is written there)", a.atResults, `clicks=${a.clicks}`);
    check("exactly one row gained a confidence value", a.log.withConfidence.length === 1,
      `rows=${a.log.count}, withConfidence=${a.log.withConfidence.length}`);
    check("the stored answer is the one the player gave", a.log.confidenceValues[0] === "sure",
      JSON.stringify(a.log.confidenceValues));
    check("no other row was given a fabricated confidence value",
      a.log.confidenceValues.length === 1 && a.log.confidenceValues.every((v) => v === "sure"),
      JSON.stringify(a.log.confidenceValues));
    check("the prompt is gone after it is answered", a.promptGone);

    /* ---- 3. skipping writes no field ---- */
    phase("2 · skipping the prompt writes NO confidence field (§6)");
    const b = await runRound(browser, base, { band: "17+", reviewLog: DUE_LOG, eventIds: DUE_LOG.map((r) => r.eventId) }, "skip");
    allErrors.push(...b.errs);
    check("the prompt rendered before the skip", b.prompt.present);
    check("the round still completed after skipping", b.atResults, `clicks=${b.clicks}`);
    check("no row carries a confidence field at all",
      b.log.withConfidence.length === 0, JSON.stringify(b.log.confidenceValues));

    /* ---- 4. 5–7 never sees the prompt ---- */
    phase("3 · age band 5–7 — the prompt must not render");
    const c = await runRound(browser, base, { band: "5-7", reviewLog: DUE_LOG, eventIds: DUE_LOG.map((r) => r.eventId) }, null);
    allErrors.push(...c.errs);
    check("a round still started for the youngest band", c.started.gameVisible);
    check("no prompt element exists anywhere in the pane", !c.prompt.present, JSON.stringify(c.prompt));
    check("and no row could carry a confidence value", c.log.withConfidence.length === 0);

    /* ---- 5. 8–11 gets the simple self-check ---- */
    phase("4 · age band 8–11 — the simple self-check, no predirected cue");
    const d = await runRound(browser, base, { band: "8-11", reviewLog: DUE_LOG, eventIds: DUE_LOG.map((r) => r.eventId) }, "sure");
    allErrors.push(...d.errs);
    check("the prompt renders for 8–11", d.prompt.present);
    check("it drops the predirected cue but keeps the question",
      d.prompt.cue == null && /how sure/i.test(d.prompt.q || ""),
      `cue=<${d.prompt.cue}>, q=<${d.prompt.q}>`);

    /* ---- 6. 4a — the why at the slip reveal ---- */
    phase("5 · 4a — a slipped card's reveal carries its one-line why");
    const e = await runRound(browser, base, { band: "17+", reviewLog: DUE_LOG, eventIds: DUE_LOG.map((r) => r.eventId) }, "skip");
    allErrors.push(...e.errs);
    check("at least one card took a slip and revealed a why line",
      e.slippedWhy.length > 0, `whyLines=${JSON.stringify(e.slippedWhy.slice(0, 2))}`);
    const klines = [...new Set(deck.events.map((x) => x.why).filter(Boolean))];
    check("every why line shown is a real event's why (not the fact, not invented)",
      e.slippedWhy.length > 0 && e.slippedWhy.every((l) => klines.some((w) => l.includes(w))),
      `checked ${e.slippedWhy.length} line(s)`);
    check("the why line is labelled for readers", e.slippedWhy.every((l) => /^Why it matters/i.test(l)),
      JSON.stringify(e.slippedWhy.slice(0, 2)));

    /* ---- 7. 4d — the focus panel's week rows ---- */
    phase("6 · 4d — the focus panel honours the 5–7 mastery-% gate");
    const weekRow = (page) =>
      page.evaluate(() => {
        const row = document.querySelector("#focus-panel .focus-card.week");
        if (!row) return null;
        return {
          sub: row.querySelector(".focus-sub") ? row.querySelector(".focus-sub").textContent : null,
          aria: row.getAttribute("aria-label"),
        };
      });
    const f = await openHome(browser, base, { band: "5-7", reviewLog: DUE_LOG, eventIds: DUE_LOG.map((r) => r.eventId) });
    allErrors.push(...f.errs);
    const w57 = await weekRow(f.page);
    check("the 5–7 focus panel shows a week row at all", !!w57, JSON.stringify(w57));
    check("it shows no mastery percentage", !!w57 && !/%/.test(w57.sub || ""), `sub=<${w57 && w57.sub}>`);
    check("it shows a 0–4 star readout instead", !!w57 && /★|☆/.test(w57.sub || ""), `sub=<${w57 && w57.sub}>`);
    await f.context.close();

    const g = await openHome(browser, base, { band: "17+", reviewLog: DUE_LOG, eventIds: DUE_LOG.map((r) => r.eventId) });
    allErrors.push(...g.errs);
    const w17 = await weekRow(g.page);
    check("17+ still shows the numeric mastery for the same profile",
      !!w17 && /Mastery \d+%/.test(w17.sub || ""), `sub=<${w17 && w17.sub}>`);
    await g.context.close();

    /* ---- 8. reduced motion ---- */
    phase("7 · reduced motion — the prompt still renders and is answerable");
    const h = await runRound(browser, base, { band: "17+", reviewLog: DUE_LOG, eventIds: DUE_LOG.map((r) => r.eventId), reducedMotion: true }, "sure");
    allErrors.push(...h.errs);
    check("the browser reports reduced motion is on", h.reduced === true, `matchMedia=${h.reduced}`);
    check("the prompt still renders", h.prompt.present, JSON.stringify(h.prompt));
    check("and the round still completes with the answer stored", h.atResults && h.log.withConfidence.length === 1,
      `atResults=${h.atResults}, withConfidence=${h.log.withConfidence.length}`);

    /* ---- 9. no errors ---- */
    phase("8 · no page errors or console errors");
    // Known environment noise, not game errors:
    //  - favicon / network probes (offline-style misses, as in the other smokes)
    //  - the globe's three.js WebGLRenderer, which cannot get a GPU context in
    //    headless Chromium. This smoke plays several full rounds, so it creates
    //    and tears down more WebGL contexts than the other smokes and surfaces
    //    it. It is filtered by CLASS (only THREE.WebGLRenderer lines), so any
    //    other console error still fails this check.
    const noise = /favicon|ERR_CONNECTION_REFUSED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|gibs\.earthdata\.nasa\.gov|THREE\.WebGLRenderer|A WebGL context could not be created|Error creating WebGL context/i;
    const real = allErrors.filter((x) => !noise.test(x));
    const webglNoise = allErrors.filter((x) => /WebGL/i.test(x)).length;
    check("no page errors or console errors during the run (headless-WebGL noise excluded)",
      real.length === 0, real.slice(0, 3).join(" | "));
    if (webglNoise) note(`${webglNoise} headless-WebGL console line(s) were filtered as environment noise`,
      "the globe's three.js renderer has no GPU in this container; it is unrelated to this slice");

    /* ---- 10. not covered ---- */
    phase("9 · explicitly not covered by this run");
    note("whether the prompt HELPS learning is NOT verified here",
      "the falsifier is a playtest (skip rate, slips/run) — this only proves the mechanics and the data contract");
    note("scoring and the exact round order are NOT verified here",
      "the round is played by clicking the first gap until it ends");
    note("how any of it LOOKS is NOT verified here", "this asserts DOM text, roles and stored values, not pixels");
    note("iOS Safari is NOT verified here", "headless Chromium is not iOS");
  } finally {
    await browser.close().catch(() => {});
    await closeServer();
  }
}

main()
  .catch((e) => { console.error("\nFEEDBACK SMOKE HARNESS ERROR:", e && e.stack ? e.stack : e); results.push({ name: "harness completed", ok: false }); })
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Feedback/confidence smoke: ${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
      console.log("FAILED:");
      for (const f of failed) console.log(`  ✗ ${f.name}`);
    }
    process.exit(failed.length ? 1 : 0);
  });
