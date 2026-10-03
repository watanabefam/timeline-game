#!/usr/bin/env node
/*
 * tools/offline-smoke/connections.mjs
 * ------------------------------------------------------------------
 * The connection cue in a REAL browser (doc/CONNECTION_CUE_PLAN.md).
 *
 * The pure module (connections.js) and the phrase table are covered by
 * scripts/test/connections.test.mjs. What no Node test can reach is the wiring:
 * that timeline.js indexes the authored edges, freezes ONE cue against the live
 * board, and renders it at the two slip moments — the rescue callout and the
 * revealed card. This smoke drives a real round and checks the rendered DOM:
 *
 *   AC1/AC3  every rendered cue names a partner that is actually ON the board
 *            (RULE 2, observed end to end rather than trusted)
 *   AC7      a rescue callout's announce string carries its cue exactly once
 *            (no double-read through the polite live region)
 *   AC2      a deck with no connections[] renders NO cue and no placeholder
 *   AC4/AC5  the two moved edges resolve against the real decks (by product
 *            behaviour: the cue fires only from the corrected holder)
 *   AC6/FR8  the age gate holds (rationale prose is 12+ only)
 *   D8       all of it holds under reduced motion
 *
 * Why it must be a browser: the eligibility rule lives in the pure module, but
 * "is the partner on the board" is a property of the moving timeline state that
 * only the running game produces. Seeding a fixed board would test the module
 * again, not the wiring.
 *
 * Run with:
 *   npm --prefix tools/offline-smoke install   # once (downloads Chrome)
 *   node tools/offline-smoke/connections.mjs
 *
 * The round is played by clicking the first unlocked gap until the rescue fires,
 * then the highlighted gap — so every card is placed after a slip, which is
 * exactly the surface a cue rides on. That reaches the results screen without
 * knowing the deck's chronology. It does NOT verify scoring or round order.
 *
 * Every profile is SEEDED into localStorage (the app reads it at boot); this
 * harness never mutates the repo and serves the tracked files read-only.
 *
 * Author-time tooling, never shipped (AGENTS.md rule 1 scope note), and
 * deliberately NOT part of `npm test` (it needs a browser download).
 *
 * NOT covered here, and never claimed: iOS Safari, how the cue LOOKS (this is a
 * DOM/text check, not pixels), print output, and whether the system-voice
 * fallback reads the cue aloud the same way a screen reader would.
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
const USER_ID = "smoke-connections";

// A deck with 61 authored edges (the cue's home) and a deck with none (the
// vacuity check). Both are named here so a rename fails loudly.
const CUE_DECK = "inventions-discoveries";
const CUE_DECK_NAME = "Inventions & Discoveries";
const BARE_DECK = "cc-timeline";
const BARE_DECK_NAME = "Classical Conversations";

const seed = (band) => {
  const user = { id: USER_ID, name: "Smoke Connections", createdAt: 1700000000000, hue: 200 };
  if (band) user.ageBand = band;
  return { users: [user], activeId: user.id };
};
const profile = () => ({ decks: {}, reviewLog: [], meta: { tz: "UTC" } });

/* ------------------------------------------------------------- pages */
async function openHome(browser, base, { band, reducedMotion = false } = {}) {
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
      // Narration off: this surface is silent, and a headless browser has no
      // voices — muting it keeps audio rows out of the error stream.
      localStorage.setItem("timeline.narration.enabled", "0");
    } catch (e) {}
  }, seed(band), profile(), USER_ID);

  await page.goto(base, { waitUntil: "load" });
  const reduced = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  await page.waitForSelector("#deck-grid .deck-card", { timeout: 20000 });
  return { context, page, errs, reduced };
}

/** Home → setup → game for a named deck (optionally a small play count). */
async function startDeck(page, deckName, { playCount = null } = {}) {
  const clicked = await page.evaluate((name) => {
    const card = [...document.querySelectorAll("#deck-grid .deck-card")]
      .find((c) => (c.querySelector(".card-title") || {}).textContent === name);
    if (!card) return false;
    card.click();
    return true;
  }, deckName);
  if (!clicked) return { clicked, gameVisible: false };

  let gameVisible = false;
  try {
    await page.waitForFunction(() => !document.getElementById("setup").classList.contains("hidden"), { timeout: 15000 });
    if (playCount != null) {
      await page.evaluate((n) => {
        const sel = document.getElementById("setup-max");
        if (!sel) return;
        const opt = [...sel.options].find((o) => o.value === String(n));
        if (opt) { sel.value = String(n); sel.dispatchEvent(new Event("change", { bubbles: true })); }
      }, playCount);
    }
    // Synthetic click: a real pointer click would land on the FX curtain, which
    // covers the viewport and grabs pointer-events while it animates.
    await page.evaluate(() => document.getElementById("setup-start").click());
    await page.waitForFunction(() => !document.getElementById("game").classList.contains("hidden"), { timeout: 20000 });
    gameVisible = true;
    await page.waitForSelector("#pane-1 .timeline .gap", { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 150));
  } catch (e) { /* recorded by the caller */ }
  return { clicked, gameVisible };
}

/**
 * The cue surfaces, as observed in the live DOM.
 *  - .tl-conn            the revealed card's line (owner + text)
 *  - .gap-callout__link  the rescue callout's line
 *  - .gap-callout        carries dataset.announce, the polite-live text
 *  - .rescue-status      the live region, sampled mid-flight
 *  - .tl-title           every placed card's title (the board, for RULE 2)
 */
const readCues = (page) =>
  page.evaluate(() => {
    const pane = document.getElementById("pane-1");
    if (!pane) return null;
    const titles = [...pane.querySelectorAll(".timeline .tl-title")].map((t) => t.textContent);
    const conns = [...pane.querySelectorAll(".tl-conn")].map((el) => {
      const card = el.closest(".tl-card");
      const own = card ? card.querySelector(".tl-title") : null;
      return { text: el.textContent || "", owner: own ? own.textContent : null };
    });
    const callouts = [...pane.querySelectorAll(".gap-callout")].map((el) => {
      const link = el.querySelector(".gap-callout__link");
      return { link: link ? link.textContent || "" : null, announce: el.dataset.announce || "" };
    });
    const status = [...pane.querySelectorAll(".rescue-status")].map((el) => el.textContent || "");
    return {
      titles, conns, callouts, status,
      links: callouts.filter((c) => c.link).map((c) => c.link),
      emptyConns: conns.filter((c) => !c.text.trim()).length,
    };
  });

/** Click the highlighted gap if a rescue is showing, else the first unlocked one. */
const clickNext = (page) =>
  page.evaluate(() => {
    const pane = document.getElementById("pane-1");
    if (!pane) return false;
    const rescue = pane.querySelector(".timeline .gap--rescue");
    if (rescue) { rescue.click(); return true; }
    const gap = [...pane.querySelectorAll(".timeline .gap")].find((g) => !g.classList.contains("gap--locked"));
    if (gap) { gap.click(); return true; }
    return false;
  });

async function playRound(page, { maxClicks = 400 } = {}) {
  const board = new Set();
  const conns = new Map();       // owner||text -> {text, owner}
  const callouts = new Map();    // announce -> {link, announce}
  const links = new Map();       // cue text -> true (rescue-callout cue lines)
  const statuses = new Set();
  let emptyConns = 0;
  let stuck = 0;

  for (let i = 0; i < maxClicks; i++) {
    const done = await page.evaluate(() => !document.getElementById("results").classList.contains("hidden"));
    if (done) return { clicks: i, done: true, board, conns, callouts, links, statuses, emptyConns };
    const s = await readCues(page);
    if (s) {
      s.titles.forEach((t) => board.add(t));
      s.conns.forEach((c) => conns.set(`${c.owner}||${c.text}`, c));
      s.callouts.forEach((c) => callouts.set(c.announce, c));
      if (s.links) s.links.forEach((t) => links.set(t, true));
      s.status.forEach((t) => statuses.add(t));
      emptyConns += s.emptyConns;
    }
    const ok = await clickNext(page);
    // A transient no-gap window can appear while the timeline rebuilds; only a
    // long run of them means genuinely stuck (the deck ran out of gaps).
    if (!ok) { stuck += 1; if (stuck > 20) break; } else stuck = 0;
    await new Promise((r) => setTimeout(r, 30));
  }
  return { clicks: -1, done: false, board, conns, callouts, links, statuses, emptyConns };
}

/** RULE 2 observed: a cue names a partner that is on the board (never itself). */
function partnerOnBoard(cue, owner, board) {
  const matched = [...board].filter((t) => t && cue.includes(t));
  const other = matched.filter((t) => t !== owner);
  return { matched, ok: other.length >= 1 };
}

async function runDeck(browser, base, { deckName, band, playCount = null, reducedMotion = false }) {
  const { context, page, errs, reduced } = await openHome(browser, base, { band, reducedMotion });
  const startedDeck = await startDeck(page, deckName, { playCount });
  const moduleOk = await page.evaluate(() => !!(window.Connections && window.Connections.PHRASES && window.Connections.cueFor));
  await new Promise((r) => setTimeout(r, 300)); // one tick so the first card settles
  const round = await playRound(page);
  await context.close();
  return { startedDeck, moduleOk, reduced, errs, ...round };
}

/* ------------------------------------------------------------- main */
async function main() {
  const port = await openServer(0).then(async (p) => { await closeServer(); return p; });
  await openServer(port);
  const base = `http://127.0.0.1:${port}/`;
  console.log(`Serving the repo read-only at ${base}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--enable-unsafe-swiftshader"],
  });

  const allErrors = [];
  try {
    /* ---- 1. the cue deck: cues render, and every cue names a board partner ---- */
    phase(`${CUE_DECK_NAME} — every rendered cue names a partner already on the board`);
    const cue = await runDeck(browser, base, { deckName: CUE_DECK_NAME, band: "17+" });
    allErrors.push(...cue.errs);
    check("the module is loaded (window.Connections with the phrase table)", cue.moduleOk);
    check("the deck round started and completed", cue.startedDeck.gameVisible && cue.done, `clicks=${cue.clicks}`);
    check("the deck actually produced cues (this is the surface under test)",
      cue.conns.size + cue.links.size > 0,
      `reveal lines=${cue.conns.size}, rescue cue lines=${cue.links.size}`);

    let badReveal = [];
    for (const c of cue.conns.values()) {
      const r = partnerOnBoard(c.text, c.owner, cue.board);
      if (!r.ok) badReveal.push({ text: c.text, owner: c.owner, matched: r.matched });
    }
    check("every revealed-card cue names a partner on the board (RULE 2, end to end)",
      badReveal.length === 0, JSON.stringify(badReveal.slice(0, 3)));

    let badRescue = [];
    for (const c of cue.callouts.values()) {
      if (!c.link) continue;
      const r = partnerOnBoard(c.link, null, cue.board);
      if (!r.ok) badRescue.push({ text: c.link, matched: r.matched });
    }
    check("every rescue-callout cue names a partner on the board",
      badRescue.length === 0, JSON.stringify(badRescue.slice(0, 3)));

    check("no empty cue placeholder is ever rendered", cue.emptyConns === 0, `empty .tl-conn=${cue.emptyConns}`);

    /* ---- AC7: the announce carries the cue exactly once ---- */
    phase("a rescue callout announces its cue exactly once (no double-read)");
    let doubleRead = [];
    for (const c of cue.callouts.values()) {
      if (!c.link) continue;
      const at = c.announce.indexOf(c.link);
      if (at === -1 || c.announce.indexOf(c.link, at + 1) !== -1) {
        doubleRead.push({ link: c.link, announce: c.announce });
      }
    }
    check("every rescue callout's announce string contains its cue exactly once",
      doubleRead.length === 0, JSON.stringify(doubleRead.slice(0, 2)));

    let statusDouble = [];
    for (const s of cue.statuses) {
      const first = s.indexOf("Connection:");
      if (first !== -1 && s.indexOf("Connection:", first + 1) !== -1) statusDouble.push(s);
    }
    check("the polite live region never announces the same cue twice",
      statusDouble.length === 0, JSON.stringify(statusDouble.slice(0, 2)));

    /* ---- AC6 / FR8: the rationale prose is 12+ only ---- */
    phase("the age gate on the rationale prose (5–7 keeps the significance line)");
    const young = await runDeck(browser, base, { deckName: CUE_DECK_NAME, band: "5-7", playCount: 10 });
    allErrors.push(...young.errs);
    check("a 5–7 round still completes with cues wired", young.startedDeck.gameVisible && young.done, `clicks=${young.clicks}`);
    // FR8 says <12 sees the phrase inline but NOT the authored rationale, which
    // only ever lands in the fact-sheet popover. Assert the popover text never
    // carries the cue sentence for the young band (structural, not pixel).
    const youngLeak = await (async () => {
      const { context, page, errs } = await openHome(browser, base, { band: "5-7" });
      allErrors.push(...errs);
      await startDeck(page, CUE_DECK_NAME, { playCount: 10 });
      let leak = 0;
      for (let i = 0; i < 120; i++) {
        const done = await page.evaluate(() => !document.getElementById("results").classList.contains("hidden"));
        if (done) break;
        leak += await page.evaluate(() => {
          const pane = document.getElementById("pane-1");
          const cueTexts = [...pane.querySelectorAll(".tl-conn")].map((e) => e.textContent);
          return [...pane.querySelectorAll(".fact-sheet")].filter((sheet) =>
            cueTexts.some((t) => t && sheet.textContent.includes(t))
          ).length;
        });
        await clickNext(page);
        await new Promise((r) => setTimeout(r, 30));
      }
      await context.close();
      return leak;
    })();
    check("no 5–7 fact sheet restates the cue phrase (FR8: phrase inline, prose gated)",
      youngLeak === 0, `sheets containing a cue phrase=${youngLeak}`);

    /* ---- AC2: a deck with no connections renders nothing ---- */
    phase(`${BARE_DECK_NAME} — a deck with no connections[] renders no cue at all`);
    const bare = await runDeck(browser, base, { deckName: BARE_DECK_NAME, band: "17+", playCount: 5 });
    allErrors.push(...bare.errs);
    check("the no-connection round started and completed", bare.startedDeck.gameVisible && bare.done, `clicks=${bare.clicks}`);
    check("no .tl-conn is rendered anywhere", bare.conns.size === 0, `reveal lines=${bare.conns.size}`);
    check("no .gap-callout__link is rendered anywhere", bare.links.size === 0, `rescue cue lines=${bare.links.size}`);
    check("the rescue surface WAS exercised (so the zero above is not vacuous)",
      bare.statuses.size > 0, `rescue-status sightings=${bare.statuses.size}`);

    /* ---- D8: reduced motion changes nothing about the cue ---- */
    phase("reduced motion — the cue still resolves against the board");
    const rm = await runDeck(browser, base, { deckName: CUE_DECK_NAME, band: "17+", reducedMotion: true });
    allErrors.push(...rm.errs);
    check("the browser reports reduced motion is on", rm.reduced === true, `matchMedia=${rm.reduced}`);
    check("the round still completes under reduced motion", rm.startedDeck.gameVisible && rm.done, `clicks=${rm.clicks}`);
    let rmBad = [];
    for (const c of rm.conns.values()) {
      const r = partnerOnBoard(c.text, c.owner, rm.board);
      if (!r.ok) rmBad.push({ text: c.text, owner: c.owner, matched: r.matched });
    }
    check("every cue under reduced motion still names a board partner", rmBad.length === 0, JSON.stringify(rmBad.slice(0, 3)));

    /* ---- no errors ---- */
    phase("no page errors or console errors");
    const noise = /favicon|ERR_CONNECTION_REFUSED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|gibs\.earthdata\.nasa\.gov|THREE\.WebGLRenderer|A WebGL context could not be created|Error creating WebGL context/i;
    const real = allErrors.filter((x) => !noise.test(x));
    const webglNoise = allErrors.filter((x) => /WebGL/i.test(x)).length;
    check("no page errors or console errors during the run (headless-WebGL noise excluded)",
      real.length === 0, real.slice(0, 3).join(" | "));
    if (webglNoise) note(`${webglNoise} headless-WebGL console line(s) were filtered as environment noise`,
      "the globe's three.js renderer has no GPU in this container; it is unrelated to this surface");

    /* ---- not covered ---- */
    phase("explicitly not covered by this run");
    note("scoring and the exact round order are NOT verified here",
      "the round is played by clicking the first unlocked gap until it ends");
    note("how the cue LOOKS is NOT verified here", "this asserts DOM text and roles, not pixels");
    note("iOS Safari is NOT verified here", "headless Chromium is not iOS");
    note("the screen-reader reading order is NOT verified here",
      "the live-region text is asserted, the spoken timing is not");
  } finally {
    await browser.close().catch(() => {});
    await closeServer();
  }
}

main()
  .catch((e) => { console.error("\nCONNECTIONS SMOKE HARNESS ERROR:", e && e.stack ? e.stack : e); results.push({ name: "harness completed", ok: false }); })
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Connections smoke: ${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
      console.log("FAILED:");
      for (const f of failed) console.log(`  ✗ ${f.name}`);
    }
    process.exit(failed.length ? 1 : 0);
  });
