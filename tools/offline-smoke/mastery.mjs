#!/usr/bin/env node
/*
 * tools/offline-smoke/mastery.mjs
 * ------------------------------------------------------------------
 * The S2 mastery level card (GAMIFICATION_BRIEF §11 phase 2, decision D4) —
 * the one shipped surface that landed without a browser check. Run with:
 *
 *   npm --prefix tools/offline-smoke install   # once (downloads Chrome)
 *   node tools/offline-smoke/mastery.mjs
 *
 * Why it exists: `renderStats()` builds the level card in the DOM from a
 * DERIVED score (`masteryOf()`), and the age-band gate (A3/§5) changes what
 * the card is allowed to say — the youngest band gets a name and one
 * encouraging line, with no badge, no progress bar, no percentage and no
 * "not enough data" copy anywhere on the screen. That is a copy + DOM
 * contract with no Node-testable half, so it needs a real browser.
 *
 * What it exercises, in a real Chromium, against a real HTTP server:
 *   1. the card grounds in derived state — the DOM title/badge/bar agree with
 *      `window.Gamify.mastery(userId)` for a profile whose score is exactly 15
 *      (4 mastered events + 1 mastered week + 2 capped perfect runs)
 *   2. age band 5–7: name + encouraging line only; no badge, no bar, no "%",
 *      and the weekly rows switch to a 0–4 star readout
 *   3. age band 8–11: name-first copy, no numeric breakdown
 *   4. age band 17+, and an UNSET band (which must behave as the highest)
 *   5. the reduced-motion path: the stats screen still opens and the card is
 *      still correct when `prefers-reduced-motion: reduce` is on
 *   6. no page or console errors along the way
 *
 * The stats screen is reached the way a player reaches it — the user button,
 * then the player's name — never by calling an internal function, so the
 * smoke also covers the screen entry.
 *
 * Every profile is SEEDED into localStorage (the app reads it at boot); this
 * harness never mutates the repo and serves the tracked files read-only, so
 * there is no throwaway copy to build (unlike smoke.mjs, which mutates one).
 *
 * Author-time tooling, never shipped (AGENTS.md rule 1 scope note), and
 * deliberately NOT part of `npm test` (it needs a browser download).
 *
 * NOT covered here, and never claimed: iOS Safari, the print stylesheet, and
 * anything about how the card *looks* (this is a DOM/state check, not a
 * pixel check).
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
      let p = decodeURIComponent(new URL(req.url, "http://x/").pathname);
      if (p.endsWith("/")) p += "index.html";
      const file = resolvePath(root, "." + p);
      // Read-only, and never outside the repo.
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
// One profile, four deterministic mastery inputs:
//   4 events at 100% first-try  → 4 mastered events
//   all 4 in week 1             → 1 mastered week (×5)
//   2 perfect runs              → 6 marks (3 each, under the cap of 5)
//   score = 4 + 5 + 6 = 15  →  level 3 "Apprentice Historian", 50% to Chronicler
const USER_ID = "smoke-mastery";
const PROFILE = {
  decks: {
    "cc-timeline": {
      totals: { runs: 2, totalScore: 8, totalMax: 8, perfectRuns: 2, totalPlacements: 4, totalSlips: 0 },
      events: {
        "cc-001": { placements: 1, slips: 0, firstTry: 1 },
        "cc-002": { placements: 1, slips: 0, firstTry: 1 },
        "cc-003": { placements: 1, slips: 0, firstTry: 1 },
        "cc-004": { placements: 1, slips: 0, firstTry: 1 },
      },
      runs: [],
    },
  },
  reviewLog: [],
  meta: { tz: "UTC" },
};
const seed = (band) => {
  const user = { id: USER_ID, name: "Smoke Mastery", createdAt: 1700000000000, hue: 120 };
  if (band) user.ageBand = band;
  return { users: [user], activeId: user.id };
};

const readCard = (page) =>
  page.evaluate((userId) => {
    const lc = document.querySelector("#stats-body .level-card");
    const q = (sel) => (lc ? lc.querySelector(sel) : null);
    const bar = q(".level-bar");
    const g = window.Gamify.mastery(userId);
    return {
      html: lc ? lc.innerHTML : null,
      text: lc ? lc.textContent : null,
      badge: q(".level-badge") ? q(".level-badge").textContent : null,
      title: q(".level-title") ? q(".level-title").textContent : null,
      sub: q(".level-sub") ? q(".level-sub").textContent : null,
      bar: bar
        ? {
            role: bar.getAttribute("role"),
            min: bar.getAttribute("aria-valuemin"),
            max: bar.getAttribute("aria-valuemax"),
            now: bar.getAttribute("aria-valuenow"),
            label: bar.getAttribute("aria-label"),
            width: bar.firstElementChild ? bar.firstElementChild.style.width : null,
          }
        : null,
      weekVals: [...document.querySelectorAll("#stats-body .mastery-val")].map((v) => ({
        text: v.textContent,
        aria: v.getAttribute("aria-label"),
      })),
      derived: {
        score: g.score, index: g.index, title: g.title, pct: g.pct, toNext: g.toNext,
        masteredEvents: g.masteredEvents, masteredWeeks: g.masteredWeeks, perfectRuns: g.perfectRuns,
      },
    };
  }, USER_ID);

/** Open stats through the real UI (user button → player name) and read the card. */
async function cardFor(browser, base, { band, reducedMotion = false } = {}) {
  const context = await browser.createBrowserContext();
  const errs = [];
  const page = await context.newPage();
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  if (reducedMotion) {
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  }
  await page.evaluateOnNewDocument((users, profile, key) => {
    try {
      localStorage.setItem("timeline.users.v1", JSON.stringify(users));
      localStorage.setItem("timeline.user." + key + ".v1", JSON.stringify(profile));
    } catch (e) {}
  }, seed(band), PROFILE, USER_ID);

  await page.goto(base, { waitUntil: "load" });
  const reduced = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  await page.click("#home .user-btn");
  await page.waitForSelector("#users-list .user-name", { timeout: 15000 });
  await page.click("#users-list .user-name");
  await page.waitForFunction(() => !document.getElementById("stats").classList.contains("hidden"), { timeout: 20000 });
  await page.waitForSelector("#stats-body .level-card", { timeout: 15000 });
  const card = await readCard(page);
  await context.close();
  return { card, reduced, errs };
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
    /* ---- 1. highest band: the full numeric card, grounded in derived state ---- */
    phase("1 · age band 17+ — the full level card");
    const a = await cardFor(browser, base, { band: "17+" });
    allErrors.push(...a.errs);
    check("the stats screen renders a level card", !!a.card.html, a.card.html ? "found" : "no .level-card");
    check("the card's title grounds in window.Gamify.mastery()",
      a.card.title === "Apprentice Historian" && a.card.derived.title === a.card.title,
      `dom="${a.card.title}", derived="${a.card.derived.title}", score=${a.card.derived.score}`);
    check("the seeded profile really scores 15 (4 events + 1 week + 2 perfect runs)",
      a.card.derived.score === 15 && a.card.derived.masteredEvents === 4 &&
      a.card.derived.masteredWeeks === 1 && a.card.derived.perfectRuns === 2,
      JSON.stringify(a.card.derived));
    check("level 3 shows as a badge", a.card.badge === "Lv 3", `badge=<${a.card.badge}>`);
    check("the progress bar is an accessible progressbar at 50%",
      !!a.card.bar && a.card.bar.role === "progressbar" && a.card.bar.now === "50" &&
      a.card.bar.min === "0" && a.card.bar.max === "100" && a.card.bar.width === "50%" &&
      /next level/i.test(a.card.bar.label || ""),
      JSON.stringify(a.card.bar));
    check("the copy names the next level and the breakdown",
      /5 mastery marks to Chronicler/.test(a.card.sub || "") &&
      /across all decks/.test(a.card.sub || "") &&
      /4 events mastered/.test(a.card.sub || "") &&
      /1 week mastered/.test(a.card.sub || "") &&
      /2 perfect runs/.test(a.card.sub || ""),
      `sub=<${a.card.sub}>`);
    check("the weekly rows show a percentage for this band",
      a.card.weekVals.length === 1 && /Mastery 100%/.test(a.card.weekVals[0].text),
      JSON.stringify(a.card.weekVals));

    /* ---- 2. band 8–11: name-first, no numeric breakdown ---- */
    phase("2 · age band 8–11 — name-first copy");
    const b = await cardFor(browser, base, { band: "8-11" });
    allErrors.push(...b.errs);
    check("the card still shows the badge and the bar",
      b.card.badge === "Lv 3" && !!b.card.bar && b.card.bar.now === "50",
      `badge=<${b.card.badge}>, bar=${!!b.card.bar}`);
    check("but the sub line drops the numeric breakdown",
      b.card.sub === "5 more to become Chronicler",
      `sub=<${b.card.sub}>`);
    check("and no percentage leaks into the card",
      !/%/.test(b.card.text || ""), `text=<${b.card.text}>`);

    /* ---- 3. band 5–7: the gate must hide badge, bar and numbers ---- */
    phase("3 · age band 5–7 — the youngest-band gate");
    const c = await cardFor(browser, base, { band: "5-7" });
    allErrors.push(...c.errs);
    check("the card is a name and one encouraging line",
      c.card.title === "Apprentice Historian" &&
      c.card.sub === "Every timeline you finish makes you a better historian.",
      `title=<${c.card.title}>, sub=<${c.card.sub}>`);
    check("the badge and the progress bar are gone",
      c.card.badge == null && c.card.bar == null,
      `badge=${c.card.badge}, bar=${!!c.card.bar}`);
    check("no percentage and no level number appear anywhere in the card",
      !/%/.test(c.card.text || "") && !/"Lv/.test(c.card.text || ""),
      `text=<${c.card.text}>`);
    check("the weekly rows switch to a 0–4 star readout instead of a percentage",
      c.card.weekVals.length === 1 &&
      c.card.weekVals[0].text === "★★★★" &&
      c.card.weekVals[0].aria === "4 of 4 stars",
      JSON.stringify(c.card.weekVals));

    /* ---- 4. an unset band behaves as the highest ---- */
    phase("4 · no age band declared — must behave as the highest");
    const d = await cardFor(browser, base, {});
    allErrors.push(...d.errs);
    check("an unset band gets the full card, not the gated one",
      d.card.badge === "Lv 3" && !!d.card.bar &&
      /mastery marks to Chronicler/.test(d.card.sub || ""),
      `badge=<${d.card.badge}>, sub=<${d.card.sub}>`);

    /* ---- 5. reduced motion ---- */
    phase("5 · reduced motion — the screen must still open and the card still be right");
    const e = await cardFor(browser, base, { band: "17+", reducedMotion: true });
    allErrors.push(...e.errs);
    check("the browser reports reduced motion is on",
      e.reduced === true, `matchMedia=${e.reduced}`);
    check("the stats screen still opens and the level card still renders",
      e.card.title === "Apprentice Historian" && e.card.badge === "Lv 3" &&
      !!e.card.bar && e.card.bar.now === "50",
      `title=<${e.card.title}>, badge=<${e.card.badge}>, bar=${e.card.bar && e.card.bar.now}`);

    /* ---- 6. no errors ---- */
    phase("6 · no page errors or console errors");
    const noise = /favicon|ERR_CONNECTION_REFUSED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|gibs\.earthdata\.nasa\.gov/i;
    const real = allErrors.filter((x) => !noise.test(x));
    check("no page errors or console errors during the run", real.length === 0, real.slice(0, 3).join(" | "));

    /* ---- 7. not covered here ---- */
    phase("7 · explicitly not covered by this run");
    check("print output is NOT verified here", true,
      "@media print restyles the card; a headless DOM check cannot see the printed page");
    check("how the card LOOKS is NOT verified here", true,
      "this asserts DOM text, roles and aria attributes, not pixels");
    check("iOS Safari is NOT verified here", true,
      "headless Chromium is not iOS; the same card is engine-independent, but that is an argument, not a measurement");
  } finally {
    await browser.close().catch(() => {});
    await closeServer();
  }
}

main()
  .catch((e) => { console.error("\nMASTERY SMOKE HARNESS ERROR:", e && e.stack ? e.stack : e); results.push({ name: "harness completed", ok: false }); })
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Mastery card smoke: ${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
      console.log("FAILED:");
      for (const f of failed) console.log(`  ✗ ${f.name}`);
    }
    process.exit(failed.length ? 1 : 0);
  });
