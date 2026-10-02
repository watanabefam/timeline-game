#!/usr/bin/env node
/*
 * tools/offline-smoke/feedback.mjs
 * ------------------------------------------------------------------
 * The A8 feedback surface, AFTER the phase-4 prompt and why-line were removed
 * (doc/CONNECTION_CUE_PLAN.md §0; doc/FEEDBACK_CONFIDENCE_PLAN.md §7). What
 * remains of A8 is the phase-2 warm-up that was folded in as 4d: a 5–7 profile
 * never sees a mastery percentage on the focus panel.
 *
 * So this smoke is now mostly a REGRESSION test — it proves the removed things
 * really are gone, in a real browser, rather than trusting a diff:
 *
 *   1. no band ever renders the pre-reveal prompt (.tl-prompt)
 *   2. no revealed card ever renders the "why it matters" line (.tl-why)
 *   3. no review-log row ever carries a `confidence` field
 *   4. 4d: a 5–7 focus panel shows stars and no percentage; 17+ shows the
 *      percentage
 *   5. all of it holds under reduced motion
 *   6. no page or console errors along the way
 *
 * Why it still exists at all: checks 1–3 are DOM + storage contracts that have
 * no Node-testable half. The pure module that used to back them
 * (prompt-plan.js, with scripts/test/prompt-plan.test.mjs) was deleted with the
 * feature, so this is the only place the absence is actually observed.
 *
 * Run with:
 *   npm --prefix tools/offline-smoke install   # once (downloads Chrome)
 *   node tools/offline-smoke/feedback.mjs
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
 * a DOM/state check), print output, and whether the connection cue that is
 * planned to replace the why-line behaves (it does not exist yet).
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

// A log engineered so the reach-back scheduler serves a due set for the 5–7
// era/week block as well as the ungated bands (the same shape review.mjs uses),
// so every band can actually start a Review round.
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

/**
 * The removed surfaces, as observed in the live DOM.
 *
 * `.tl-prompt` and `.tl-why` must never appear; `tl-why` is polled during play
 * as well, because a revealed card is only in the DOM for part of a round.
 */
const readRemovedSurfaces = (page) =>
  page.evaluate(() => {
    const pane = document.getElementById("pane-1");
    const doc = document;
    return {
      promptsInPane: pane.querySelectorAll(".tl-prompt").length,
      promptsInDoc: doc.querySelectorAll(".tl-prompt").length,
      whyInPane: pane.querySelectorAll(".tl-why").length,
      whyInDoc: doc.querySelectorAll(".tl-why").length,
      // The A8 CSS should be gone too: a stray rule would mean a half-revert.
      promptRule: !!([...doc.styleSheets].some((s) => {
        try { return [...s.cssRules].some((r) => r.selectorText && /tl-prompt/.test(r.selectorText)); }
        catch (e) { return false; }
      })),
    };
  });

/** Click the first gap until the results screen appears. Wrong slots loop. */
async function playRound(page, { maxClicks = 80 } = {}) {
  const seen = { prompts: 0, why: 0 };
  for (let i = 0; i < maxClicks; i++) {
    const done = await page.evaluate(() => !document.getElementById("results").classList.contains("hidden"));
    if (done) return { clicks: i, seen };
    // Sample the removed surfaces mid-play: a revealed slipped card lives in the
    // DOM only until the next placement replaces it.
    const now = await readRemovedSurfaces(page);
    seen.prompts += now.promptsInDoc;
    seen.why += now.whyInDoc;
    await page.evaluate(() => {
      const gaps = document.querySelectorAll("#pane-1 .timeline .gap");
      if (gaps.length) gaps[0].click();
    });
    await new Promise((r) => setTimeout(r, 35));
  }
  return { clicks: -1, seen };
}

const readLog = (page) =>
  page.evaluate((id) => {
    let p = {};
    try { p = JSON.parse(localStorage.getItem("timeline.user." + id + ".v1") || "{}"); } catch (e) {}
    const log = Array.isArray(p.reviewLog) ? p.reviewLog : [];
    return {
      count: log.length,
      withConfidence: log.filter((r) => r && Object.prototype.hasOwnProperty.call(r, "confidence")).length,
      outcomes: log.map((r) => r.outcome),
    };
  }, USER_ID);

/** A completed round, returning the pieces the absence checks need. */
async function runRound(browser, base, opts) {
  const { context, page, errs, reduced } = await openHome(browser, base, opts);
  const started = await startReview(page);
  const before = await readRemovedSurfaces(page);
  const { clicks, seen } = await playRound(page);
  const after = await readRemovedSurfaces(page);
  const log = await readLog(page);
  const atResults = await page.evaluate(() => !document.getElementById("results").classList.contains("hidden"));
  await context.close();
  const prompts = before.promptsInDoc + after.promptsInDoc + seen.prompts;
  const why = before.whyInDoc + after.whyInDoc + seen.why;
  return { started, clicks, log, atResults, prompts, why, styleRule: before.promptRule || after.promptRule, errs, reduced };
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
  const rounds = {};
  try {
    /* ---- 1–3. every band: the removed surfaces never render ---- */
    for (const band of ["17+", "8-11", "5-7"]) {
      phase(`${band} — the removed prompt/why surfaces must never render`);
      const r = await runRound(browser, base, {
        band, reviewLog: DUE_LOG, eventIds: DUE_LOG.map((x) => x.eventId),
      });
      rounds[band] = r;
      allErrors.push(...r.errs);
      check(`a round started and completed for ${band}`, r.started.gameVisible && r.atResults, `clicks=${r.clicks}`);
      check(`no .tl-prompt anywhere in the document (${band})`, r.prompts === 0, `sightings=${r.prompts}`);
      check(`no .tl-why anywhere in the document (${band})`, r.why === 0, `sightings=${r.why}`);
      check(`no row carries a confidence field (${band})`,
        r.log.withConfidence === 0, `rows=${r.log.count}, withConfidence=${r.log.withConfidence}`);
    }

    phase("the A8 prompt CSS is gone (a stray rule would mean a half-revert)");
    check("no stylesheet rule matches .tl-prompt",
      !rounds["17+"].styleRule, `ruleFound=${rounds["17+"].styleRule}`);

    phase("the review log is still written, and unchanged in shape");
    check("the round wrote outcome rows at all", rounds["17+"].log.count > 0,
      `rows=${rounds["17+"].log.count}`);
    check("every row's outcome is one of the two documented values",
      rounds["17+"].log.outcomes.every((o) => o === "firstTry" || o === "slip"),
      JSON.stringify(rounds["17+"].log.outcomes.slice(0, 6)));

    /* ---- 4d — the focus panel's week rows (kept from phase 4) ---- */
    phase("4d — the focus panel honours the 5–7 mastery-% gate");
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

    /* ---- reduced motion ---- */
    phase("reduced motion — the same absences hold");
    const h = await runRound(browser, base, {
      band: "17+", reviewLog: DUE_LOG, eventIds: DUE_LOG.map((x) => x.eventId), reducedMotion: true,
    });
    allErrors.push(...h.errs);
    check("the browser reports reduced motion is on", h.reduced === true, `matchMedia=${h.reduced}`);
    check("no prompt rendered under reduced motion", h.prompts === 0, `sightings=${h.prompts}`);
    check("no why line rendered under reduced motion", h.why === 0, `sightings=${h.why}`);
    check("and the round still completes", h.atResults, `clicks=${h.clicks}`);

    /* ---- no errors ---- */
    phase("no page errors or console errors");
    // Known environment noise, not game errors:
    //  - favicon / network probes (offline-style misses, as in the other smokes)
    //  - the globe's three.js WebGLRenderer, which cannot get a GPU context in
    //    headless Chromium. This smoke plays several full rounds, so it creates
    //    and tears down more WebGL contexts than the other smokes and surfaces
    //    it. It is filtered by CLASS (only WebGL lines), so any other console
    //    error still fails this check.
    const noise = /favicon|ERR_CONNECTION_REFUSED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|gibs\.earthdata\.nasa\.gov|THREE\.WebGLRenderer|A WebGL context could not be created|Error creating WebGL context/i;
    const real = allErrors.filter((x) => !noise.test(x));
    const webglNoise = allErrors.filter((x) => /WebGL/i.test(x)).length;
    check("no page errors or console errors during the run (headless-WebGL noise excluded)",
      real.length === 0, real.slice(0, 3).join(" | "));
    if (webglNoise) note(`${webglNoise} headless-WebGL console line(s) were filtered as environment noise`,
      "the globe's three.js renderer has no GPU in this container; it is unrelated to this surface");

    /* ---- not covered ---- */
    phase("explicitly not covered by this run");
    note("the connection cue is NOT tested here", "it does not exist yet — see doc/CONNECTION_CUE_PLAN.md");
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
    console.log(`Feedback/removal smoke: ${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
      console.log("FAILED:");
      for (const f of failed) console.log(`  ✗ ${f.name}`);
    }
    process.exit(failed.length ? 1 : 0);
  });
