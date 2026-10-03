#!/usr/bin/env node
/*
 * tools/offline-smoke/streak.mjs
 * ------------------------------------------------------------------
 * The streak surface (doc/MVP_PLAN.md S2; decisions D1/D2/D3, amendment A5).
 * Run with:
 *
 *   npm --prefix tools/offline-smoke install   # once (downloads Chrome)
 *   npm run smoke:streak
 *
 * Why it needs a real browser: `streakState()` derives the streak from the
 * append-only review log, and `renderStreakChip()` / `streakCalendarEl()` turn
 * that into DOM. The derivation is pure, but the CONTRACT — which states the
 * chip and the calendar expose, and which band sees a percentage — has no
 * Node-testable half.
 *
 * What it proves, in a real Chromium against a real HTTP server:
 *   1. the chip is HIDDEN for a profile with no qualifying day (never a 0-day)
 *   2. an active streak shows the count, and the DOM agrees with
 *      `window.Gamify.streakState()` (derived, never a stored counter)
 *   3. a missed day inside the grace window reads as forgiven/at-risk, never
 *      as a failure, and the calendar marks that day `forgiven`
 *   4. the calendar is a real <table> with <th scope="col"> and per-cell
 *      aria-labels, so the month is navigable as a table, not as a wall of divs
 *   5. the best streak survives a reset (a past record is never erased)
 *   6. the streak is rendered BESIDE the level card — the conflict ledger
 *      forbids shipping the streak alone (§11 phase 2)
 *   7. 5–7 gets words, not a percentage; an unset band behaves as the highest
 *   8. reduced motion changes nothing about the DOM contract
 *
 * Every profile is SEEDED into localStorage (the app reads it at boot); the
 * harness serves tracked files read-only and never mutates the repo.
 *
 * Author-time tooling, never shipped (AGENTS.md rule 1 scope note), and
 * deliberately NOT part of `npm test` (it needs a browser download).
 *
 * NOT covered, and never claimed: iOS Safari, print output, pixels, and the
 * screen reader's spoken timing (the aria-labels are asserted, the speech is
 * not).
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? `\n      ${detail}` : ""}`);
};
const note = (name, detail = "") =>
  console.log(`  · ${name}${detail ? `\n      ${detail}` : ""}`);
const phase = (title) => console.log(`\n── ${title}`);

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".mp3": "audio/mpeg", ".woff2": "font/woff2", ".txt": "text/plain",
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
      const file = join(root, p === "/" ? "index.html" : p.replace(/^\/+/, ""));
      if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404); res.end("not found"); return;
      }
      res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
      res.end(readFileSync(file));
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server.address().port));
  });
const closeServer = () =>
  new Promise((resolve) => { if (server) server.close(() => resolve()); else resolve(); });

const DAY = 86400000;
const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);
const USER_ID = "smoke-streak";
const PROFILE_KEY = "timeline.user." + USER_ID + ".v1";
const today = dayKey(Date.now());
const daysAgo = (n) => dayKey(Date.now() - n * DAY);

/**
 * A profile with `dayOffsets` as its active days (0 = today).
 *
 * `totals.runs` matters: the app treats a profile as "has played" once it has
 * a run, which is what makes the focus panel and stats screens reachable.
 */
function seed({ band = "17+", dayOffsets = [], bestDays = [] }) {
  const log = [];
  const all = dayOffsets.concat(bestDays);
  all.forEach((off, i) => {
    log.push({ ts: Date.now() - off * DAY + i, deck: "inventions-discoveries",
      eventId: "e" + i, outcome: "firstTry", mode: "free" });
  });
  const users = { users: [{ id: USER_ID, name: "Streaky", createdAt: 0, hue: 200, ageBand: band }], activeId: USER_ID };
  const profile = {
    decks: {
      "inventions-discoveries": {
        totals: { runs: 3, totalScore: 30, totalMax: 40, perfectRuns: 0, totalPlacements: 40, totalSlips: 10 },
        runs: [{ at: Date.now() }],
        events: { e0: { placements: 4, slips: 0, firstTry: 4 } },
      },
    },
    reviewLog: log,
    meta: { tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
  };
  return { users, profile };
}

/** Read the chip + calendar + level card, and the derived state to compare against. */
const readStreak = (page) =>
  page.evaluate(() => {
    const chip = document.getElementById("streak-chip");
    const cal = document.querySelector("#stats-body .streak-cal");
    const cells = cal ? [...cal.querySelectorAll("td.streak-day")] : [];
    const g = window.Gamify.streakState();
    return {
      chip: chip ? {
        hidden: chip.classList.contains("hidden"),
        state: chip.getAttribute("data-state"),
        count: chip.getAttribute("data-count"),
        best: chip.getAttribute("data-best"),
        text: chip.textContent || "",
      } : null,
      cal: cal ? {
        tag: cal.querySelector("table") ? "table" : "none",
        heads: [...cal.querySelectorAll("thead th")].map((th) => th.getAttribute("scope")),
        headText: [...cal.querySelectorAll("thead th")].map((th) => th.textContent),
        cells: cells.map((c) => ({ state: c.getAttribute("data-state"), day: c.getAttribute("data-day"), aria: c.getAttribute("aria-label") })),
        summary: (cal.querySelector(".streak-cal-summary") || {}).textContent || "",
        empty: !!cal.querySelector(".streak-cal-empty"),
      } : null,
      levelCard: !!document.querySelector("#stats-body .level-card"),
      derived: {
        state: g.state, count: g.count, best: g.best, activeToday: g.activeToday,
        forgiven: g.forgiven, days: g.days.length, resumable: g.resumable,
      },
    };
  });

/** Boot with a seeded profile, reach stats through the real UI, read everything. */
async function run(browser, base, { band = "17+", dayOffsets = [], bestDays = [], reducedMotion = false, goToStats = true } = {}) {
  const context = await browser.createBrowserContext();
  const errs = [];
  const page = await context.newPage();
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  if (reducedMotion) {
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  }
  const { users, profile } = seed({ band, dayOffsets, bestDays });
  await page.evaluateOnNewDocument((u, p, k) => {
    try {
      localStorage.setItem("timeline.users.v1", JSON.stringify(u));
      localStorage.setItem("timeline.user." + k + ".v1", JSON.stringify(p));
    } catch (e) {}
  }, users, profile, USER_ID);

  await page.goto(base, { waitUntil: "load" });
  const reduced = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  // The chip lives on Home, which is the first screen after boot.
  await page.waitForSelector("#streak-chip", { timeout: 15000 });
  const home = await readStreak(page);
  if (!goToStats) {
    await context.close();
    return { home, stats: null, reduced, errs };
  }
  await page.click("#home .user-btn");
  await page.waitForSelector("#users-list .user-name", { timeout: 15000 });
  await page.click("#users-list .user-name");
  await page.waitForFunction(() => !document.getElementById("stats").classList.contains("hidden"), { timeout: 20000 });
  await page.waitForSelector("#stats-body .streak-cal", { timeout: 15000 });
  const stats = await readStreak(page);
  await context.close();
  return { home, stats, reduced, errs };
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
  try {
    /* ---- 1. no qualifying day: the chip must not exist at all ---- */
    phase("1 · a profile with no practice day shows no chip (never a 0-day)");
    const none = await run(browser, base, { dayOffsets: [], goToStats: false });
    allErrors.push(...none.errs);
    check("the chip is hidden when there is no qualifying day",
      !!none.home.chip && none.home.chip.hidden === true,
      JSON.stringify(none.home.chip));
    check("the derived state is `none` with no days",
      none.home.derived.state === "none" && none.home.derived.days === 0,
      JSON.stringify(none.home.derived));

    /* ---- 2. an active streak, grounded in derived state ---- */
    phase("2 · an active streak — the DOM agrees with window.Gamify.streakState()");
    const active = await run(browser, base, { dayOffsets: [0, 1, 2], goToStats: true });
    allErrors.push(...active.errs);
    check("the chip is visible and reports state=active",
      !!active.home.chip && !active.home.chip.hidden && active.home.chip.state === "active",
      JSON.stringify(active.home.chip));
    check("the chip's count agrees with the derived state",
      Number(active.home.chip.count) === active.home.derived.count && active.home.derived.count === 3,
      `chip=${active.home.chip.count}, derived=${active.home.derived.count}`);
    check("the chip says today counts",
      /Today counts/i.test(active.home.chip.text), `text=<${active.home.chip.text}>`);

    /* ---- 3. the calendar is a real, navigable table ---- */
    phase("3 · the calendar is a table, not a wall of divs");
    check("the calendar renders a <table>", active.stats.cal.tag === "table", `tag=${active.stats.cal.tag}`);
    check("all seven weekday headers carry scope=col",
      active.stats.cal.heads.length === 7 && active.stats.cal.heads.every((s) => s === "col"),
      JSON.stringify(active.stats.cal.heads));
    check("every day cell carries an aria-label and a data-state",
      active.stats.cal.cells.length === 35 &&
        active.stats.cal.cells.every((c) => c.aria && c.state),
      `cells=${active.stats.cal.cells.length}, sample=${JSON.stringify(active.stats.cal.cells[20])}`);
    const todayCell = active.stats.cal.cells.find((c) => c.day === today);
    check("today's cell is marked `today`",
      !!todayCell && todayCell.state === "today", JSON.stringify(todayCell));
    check("three practised days are marked `on` or `today`",
      active.stats.cal.cells.filter((c) => c.state === "on" || c.state === "today").length === 3,
      JSON.stringify(active.stats.cal.cells.filter((c) => c.state === "on" || c.state === "today")));

    /* ---- 4. the streak ships BESIDE the level card (conflict ledger) ---- */
    phase("4 · the streak is paired with the mastery level card");
    check("the level card is present on the same screen as the calendar",
      active.stats.levelCard === true, `levelCard=${active.stats.levelCard}`);

    /* ---- 5. a one-day gap is forgiven, never a failure ---- */
    phase("5 · a one-day gap inside the week is forgiven, not punished");
    const gap = await run(browser, base, { dayOffsets: [0, 2, 3] });
    allErrors.push(...gap.errs);
    const forgivenDay = daysAgo(1);
    const cell = gap.stats.cal.cells.find((c) => c.day === forgivenDay);
    check("the missed day is derived as forgiven",
      gap.stats.derived.forgiven.includes(forgivenDay),
      `forgiven=${JSON.stringify(gap.stats.derived.forgiven)}, expected ${forgivenDay}`);
    check("the calendar marks that day `forgiven` (not `missed`)",
      !!cell && cell.state === "forgiven", JSON.stringify(cell));
    check("the chain is still alive across the gap",
      gap.stats.derived.count >= 3 && gap.stats.derived.state === "active",
      JSON.stringify(gap.stats.derived));
    check("no failure language appears anywhere on the streak surfaces",
      !/fail|lost|broken|missed!/i.test((gap.home.chip.text || "") + (gap.stats.cal.summary || "")),
      `chip=<${gap.home.chip.text}> summary=<${gap.stats.cal.summary}>`);

    /* ---- 6. the best streak survives a reset ---- */
    phase("6 · a past record is never erased by a break");
    const reset = await run(browser, base, { dayOffsets: [0], bestDays: [30, 31, 32, 33, 34, 35] });
    allErrors.push(...reset.errs);
    check("the best streak is reported from history",
      reset.stats.derived.best >= 6, JSON.stringify(reset.stats.derived));
    check("the calendar summary shows current AND best",
      /Current: 1 day/.test(reset.stats.cal.summary) && /Best: 6 day/.test(reset.stats.cal.summary),
      `summary=<${reset.stats.cal.summary}>`);

    /* ---- 7. the 5–7 band gets words, not a percentage ---- */
    phase("7 · age band 5–7 — words, never a bare percentage");
    const young = await run(browser, base, { band: "5-7", dayOffsets: [0, 1] });
    allErrors.push(...young.errs);
    check("the chip is visible for 5–7", !!young.home.chip && !young.home.chip.hidden,
      JSON.stringify(young.home.chip));
    check("the chip does not use the word 'streak'",
      !/streak/i.test(young.home.chip.text), `text=<${young.home.chip.text}>`);
    check("no percentage appears in the chip or the calendar",
      !/%/.test((young.home.chip.text || "") + (young.stats.cal.summary || "")),
      `chip=<${young.home.chip.text}> summary=<${young.stats.cal.summary}>`);
    check("the calendar still renders for this band", young.stats.cal.tag === "table");

    /* ---- 8. an unset band behaves as the highest ---- */
    phase("8 · an unset band behaves as the highest (GAMIFICATION_BRIEF §5)");
    const unset = await run(browser, base, { band: "", dayOffsets: [0, 1] });
    allErrors.push(...unset.errs);
    check("an unset band sees the full wording",
      /day streak/.test(unset.home.chip.text), `text=<${unset.home.chip.text}>`);

    /* ---- 9. reduced motion changes nothing about the contract ---- */
    phase("9 · reduced motion — the contract is identical");
    const rm = await run(browser, base, { dayOffsets: [0, 1, 2], reducedMotion: true });
    allErrors.push(...rm.errs);
    check("the browser reports reduced motion is on", rm.reduced === true, `matchMedia=${rm.reduced}`);
    check("the chip and calendar are still correct under reduced motion",
      rm.home.chip.state === "active" && rm.stats.cal.tag === "table" &&
        Number(rm.home.chip.count) === rm.stats.derived.count,
      JSON.stringify({ chip: rm.home.chip, tag: rm.stats.cal.tag }));

    /* ---- 10. no errors ---- */
    phase("10 · no page or console errors");
    const noise = /favicon|ERR_CONNECTION_REFUSED|gibs\.earthdata\.nasa\.gov|WebGL|THREE\.WebGLRenderer/i;
    const real = allErrors.filter((x) => !noise.test(x));
    check("no page errors or console errors during the run (headless-WebGL noise excluded)",
      real.length === 0, real.slice(0, 3).join(" | "));

    phase("explicitly not covered by this run");
    note("iOS Safari is NOT verified here", "headless Chromium is not iOS");
    note("how the streak LOOKS is NOT verified here", "this asserts DOM state and roles, not pixels");
    note("the screen reader's spoken timing is NOT verified here",
      "the aria-labels are asserted, the speech is not");
  } finally {
    await browser.close().catch(() => {});
    await closeServer();
  }
}

main()
  .catch((e) => { console.error("\nSTREAK SMOKE HARNESS ERROR:", e && e.stack ? e.stack : e); results.push({ name: "harness completed", ok: false }); })
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Streak smoke: ${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
      console.log("FAILED:");
      for (const f of failed) console.log(`  ✗ ${f.name}`);
    }
    process.exit(failed.length ? 1 : 0);
  });
