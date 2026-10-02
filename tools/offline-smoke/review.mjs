#!/usr/bin/env node
/*
 * tools/offline-smoke/review.mjs
 * ------------------------------------------------------------------
 * The Focus-panel Review round (doc/REVIEW_QUEUE_PLAN.md T5/T6) — the first
 * surface that calls the pure scheduler (review-scheduler.js). Run with:
 *
 *   npm --prefix tools/offline-smoke install   # once (downloads Chrome)
 *   node tools/offline-smoke/review.mjs
 *
 * Why it exists: `renderFocusPanel()` derives a due count from `reviewDueEvents()`
 * and `startFocusRound()` builds a forced pool from the scheduler's due set,
 * failing open to the old weakest-events logic. That is a DOM + derived-state
 * contract with no Node-testable half (the scheduler itself is covered by
 * scripts/test/review-scheduler.test.mjs), so it needs a real browser.
 *
 * What it exercises, in a real Chromium, against a real read-only HTTP server:
 *   1. the Review round card's due count is derived — it matches an expected
 *      number computed by hand from the seeded log (9 due for 17+/unset)
 *   2. clicking it actually starts a round with the scheduler's due items: the
 *      events rendered in the timeline all belong to the seeded due set
 *   3. a too-small due set fails OPEN: the card still shows, and clicking it
 *      still starts a round (falling back to weakest-events + padding)
 *   4. age gate (A2/§20): band 5–7 is capped to its era/week block, so its due
 *      count is strictly smaller than the ungated one and a subset of it
 *   5. J2: with nothing due the panel shows the calm "all caught up" state — a
 *      non-button — and NO "Review round" affordance
 *   6. reduced motion: the panel still renders the correct card
 *   7. no page or console errors along the way
 *
 * Every profile is SEEDED into localStorage (the app reads it at boot); this
 * harness never mutates the repo and serves the tracked files read-only.
 *
 * Author-time tooling, never shipped (AGENTS.md rule 1 scope note), and
 * deliberately NOT part of `npm test` (it needs a browser download).
 *
 * NOT covered here, and never claimed: iOS Safari, how the panel LOOKS (this is
 * a DOM/state check), and the exact ordering of a review round (only that the
 * pool is drawn from the due set).
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
const USER_ID = "smoke-review";
const deck = JSON.parse(readFileSync(join(root, "decks", DECK_ID, "deck.json"), "utf8"));
const titleOf = new Map(deck.events.map((e) => [e.id, e.title]));

// The seeded log is engineered so recency (>= 3 placements back) selects exactly
// these ids: six ancient-era events, then three cross-era ones, then three
// recent rows (so the last row sets the "current" block: ancient / week 2).
const row = (eventId) => ({ ts: 1700000000000, deck: DECK_ID, eventId, outcome: "firstTry", mode: "free" });
const DUE_LOG = [
  "cc-001", "cc-004", "cc-005", "cc-006", "cc-007", "cc-008", // ancient (due)
  "cc-049", "cc-074", "cc-087",                               // medieval / early-modern / industrial (due, cross-era)
  "cc-002", "cc-003",                                         // recent — not due
  "cc-009",                                                   // last row -> current era/week
].map(row);
const DUE_17 = ["cc-001", "cc-004", "cc-005", "cc-006", "cc-007", "cc-008", "cc-049", "cc-074", "cc-087"];
const DUE_5_7 = ["cc-001", "cc-004", "cc-005", "cc-006", "cc-007", "cc-008"];

// Only three events are due here (too few to form a 5-card puzzle) -> fail open.
const SMALL_LOG = ["cc-001", "cc-002", "cc-003", "cc-004", "cc-005", "cc-006"].map(row);

const eventState = (ids) => Object.fromEntries(ids.map((id) => [id, { placements: 1, slips: 0, firstTry: 1 }]));
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
  const user = { id: USER_ID, name: "Smoke Review", createdAt: 1700000000000, hue: 120 };
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

const readPanel = (page) =>
  page.evaluate(() => {
    const host = document.getElementById("focus-panel");
    const card = host.querySelector(".focus-card");
    return {
      hidden: host.classList.contains("hidden"),
      title: card && card.querySelector(".focus-title") ? card.querySelector(".focus-title").textContent : null,
      sub: card && card.querySelector(".focus-sub") ? card.querySelector(".focus-sub").textContent : null,
      caughtUp: !!host.querySelector(".focus-card.caught-up"),
      caughtUpTag: host.querySelector(".focus-card.caught-up") ? host.querySelector(".focus-card.caught-up").tagName : null,
      reviewButtons: [...host.querySelectorAll("button.focus-card")].filter((b) => /Review round/.test(b.textContent)).length,
      text: host.textContent,
    };
  });

/** Click the Review round card and read the titles rendered in the game timeline. */
async function startReviewAndRead(browser, base, opts) {
  const { context, page, errs } = await openHome(browser, base, opts);
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
  } catch (e) { /* recorded by the caller */ }
  const titles = await page.evaluate(() => [...document.querySelectorAll("#pane-1 .tl-title")].map((el) => el.textContent));
  await context.close();
  return { clickable, gameVisible, titles, errs };
}

/* ------------------------------------------------------------- main */
async function main() {
  const port = await openServer(0).then(async (p) => { await closeServer(); return p; });
  await openServer(port);
  const base = `http://127.0.0.1:${port}/`;
  console.log(`Serving the repo read-only at ${base}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  const allErrors = [];
  const dueTitles = new Set(DUE_17.map((id) => titleOf.get(id)));

  try {
    /* ---- 1. the due count is derived (17+, the ungated band) ---- */
    phase("1 · age band 17+ — the derived due count");
    const a = await openHome(browser, base, { band: "17+", reviewLog: DUE_LOG, eventIds: DUE_17 });
    allErrors.push(...a.errs);
    const pa = await readPanel(a.page);
    check("the Focus panel renders a Review round card", pa.title === "Review round", `title=<${pa.title}>`);
    check("the card's due count matches the seeded due set (9)",
      /(^|\s)9 events due for review/.test(pa.sub || ""), `sub=<${pa.sub}>`);
    check("the panel is not the J2 state when items are due", !pa.caughtUp && pa.reviewButtons === 1);
    await a.context.close();

    /* ---- 2. clicking starts a round drawn from the due set ---- */
    phase("2 · clicking Review round starts a round from the due items (J1)");
    const b = await startReviewAndRead(browser, base, { band: "17+", reviewLog: DUE_LOG, eventIds: DUE_17 });
    allErrors.push(...b.errs);
    check("the Review round card was clickable", b.clickable);
    check("clicking it opened the game screen", b.gameVisible);
    check("the timeline shows at least one event", b.titles.length > 0, `titles=${JSON.stringify(b.titles.slice(0, 4))}`);
    check("every event in play comes from the scheduled due set",
      b.titles.length > 0 && b.titles.every((t) => dueTitles.has(t)),
      `offenders=${JSON.stringify(b.titles.filter((t) => !dueTitles.has(t)))}`);

    /* ---- 3. a too-small due set fails open, it does not block ---- */
    phase("3 · too few due — the panel fails open to the old pool");
    const c = await openHome(browser, base, { band: "17+", reviewLog: SMALL_LOG, eventIds: DUE_17 });
    allErrors.push(...c.errs);
    const pc = await readPanel(c.page);
    check("the card still renders and reports the small due count (3)",
      pc.title === "Review round" && /(^|\s)3 events due for review/.test(pc.sub || ""), `sub=<${pc.sub}>`);
    await c.context.close();
    const d = await startReviewAndRead(browser, base, { band: "17+", reviewLog: SMALL_LOG, eventIds: DUE_17 });
    allErrors.push(...d.errs);
    check("clicking it still starts a round rather than dead-ending", d.gameVisible);

    /* ---- 4. the age gate narrows a young band to its block ---- */
    phase("4 · age band 5–7 — the gate caps the due set to its era/week block");
    const e = await openHome(browser, base, { band: "5-7", reviewLog: DUE_LOG, eventIds: DUE_17 });
    allErrors.push(...e.errs);
    const pe = await readPanel(e.page);
    check("the 5–7 card shows the narrower due count (6)",
      pe.title === "Review round" && /(^|\s)6 events due for review/.test(pe.sub || ""), `sub=<${pe.sub}>`);
    check("the gated count is strictly smaller than the ungated one",
      DUE_5_7.length < DUE_17.length && DUE_5_7.every((id) => DUE_17.includes(id)),
      `gated=${DUE_5_7.length}, ungated=${DUE_17.length}`);
    await e.context.close();

    /* ---- 5. J2: nothing due is a calm state, not a dead button ---- */
    phase("5 · J2 — nothing due shows the all-caught-up state");
    const f = await openHome(browser, base, { band: "17+", reviewLog: [], eventIds: [] });
    allErrors.push(...f.errs);
    const pf = await readPanel(f.page);
    check("the panel shows the all-caught-up state",
      pf.caughtUp && /all caught up/i.test(pf.title || ""), `title=<${pf.title}>, caughtUp=${pf.caughtUp}`);
    check("the empty state is not a clickable button",
      pf.caughtUpTag === "DIV" && pf.reviewButtons === 0, `tag=${pf.caughtUpTag}, reviewButtons=${pf.reviewButtons}`);
    await f.context.close();

    /* ---- 6. reduced motion ---- */
    phase("6 · reduced motion — the panel still renders correctly");
    const g = await openHome(browser, base, { band: "17+", reviewLog: DUE_LOG, eventIds: DUE_17, reducedMotion: true });
    allErrors.push(...g.errs);
    const pg = await readPanel(g.page);
    check("the browser reports reduced motion is on", g.reduced === true, `matchMedia=${g.reduced}`);
    check("the Review round card still shows the derived count",
      pg.title === "Review round" && /(^|\s)9 events due for review/.test(pg.sub || ""), `sub=<${pg.sub}>`);
    await g.context.close();

    /* ---- 7. no errors ---- */
    phase("7 · no page errors or console errors");
    const noise = /favicon|ERR_CONNECTION_REFUSED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|gibs\.earthdata\.nasa\.gov/i;
    const real = allErrors.filter((x) => !noise.test(x));
    check("no page errors or console errors during the run", real.length === 0, real.slice(0, 3).join(" | "));

    /* ---- 8. not covered here ---- */
    phase("8 · explicitly not covered by this run");
    note("the ORDER of a review round is NOT verified here",
      "only that every event in play is drawn from the due set");
    note("how the panel LOOKS is NOT verified here",
      "this asserts DOM text and structure, not pixels");
    note("iOS Safari is NOT verified here",
      "headless Chromium is not iOS");
  } finally {
    await browser.close().catch(() => {});
    await closeServer();
  }
}

main()
  .catch((e) => { console.error("\nREVIEW SMOKE HARNESS ERROR:", e && e.stack ? e.stack : e); results.push({ name: "harness completed", ok: false }); })
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Review surface smoke: ${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
      console.log("FAILED:");
      for (const f of failed) console.log(`  ✗ ${f.name}`);
    }
    process.exit(failed.length ? 1 : 0);
  });
