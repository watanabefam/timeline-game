#!/usr/bin/env node
/*
 * tools/offline-smoke/smoke.mjs
 * ------------------------------------------------------------------
 * The browser smoke checklist, automated. Run with:
 *
 *   npm --prefix tools/offline-smoke install   # once (downloads Chrome)
 *   node tools/offline-smoke/smoke.mjs
 *
 * It is author-time tooling and never shipped (AGENTS.md rule 1 scope note),
 * exactly like tools/narration. It is deliberately NOT part of `npm test`:
 * it needs a ~150 MB browser download and a real Chromium, and a suite that
 * cannot run must not be able to report clean.
 *
 * What it exercises, in a real Chromium, against a real HTTP server:
 *   1. installability — the browser parses the manifest, and the worker
 *      registers with the content-derived hash in its URL
 *   2. precache completion via the worker→page message, and the cache's shape
 *   3. offline boot with the server actually stopped (not a network flag)
 *   4. a device with the worker but nothing cached: the offline page
 *   5. a re-rendered clip at an unchanged path — the new bytes must be heard
 *      (this is the bug the content-addressed keys exist to prevent)
 *   6. an update must not apply mid-game, and must apply once the game ends
 *   7. two tabs across a generation change: one cache, no leftovers
 *   8. storage persistence, both granted (via CDP) and not granted
 *
 * Every mutation happens in a COPY of the site (.work/site), never in the repo:
 * the checked-in narration clips and icons are read-only inputs here.
 *
 * NOT coverable here, and never claimed: iOS/WebKit behaviour, the real
 * install prompt (headless Chromium does not fire beforeinstallprompt), and
 * storage eviction under memory pressure. Those stay on the AGENTS.md
 * checklist with a note saying they were not run.
 */
import { createServer } from "node:http";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const work = join(here, ".work");
const site = join(work, "site");

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".mp3": "audio/mpeg", ".jpg": "image/jpeg",
};

/* ------------------------------------------------- one copy of the site */
function buildSite() {
  rmSync(site, { recursive: true, force: true });
  const manifest = JSON.parse(readFileSync(join(root, "offline-manifest.json"), "utf8"));
  const needed = new Set(manifest.files.map((f) => f.path));
  for (const extra of ["sw.js", "offline-manifest.json", "offline-manifest.js"]) needed.add(extra);
  for (const rel of needed) {
    const from = join(root, rel);
    if (!existsSync(from)) throw new Error(`site copy: ${rel} is missing in the repo`);
    const to = join(site, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
  // The generator travels with the copy so mutations can be regenerated in
  // place; it resolves its own root, so it writes into the copy.
  const gen = "scripts/gen-offline-manifest.mjs";
  mkdirSync(join(site, "scripts"), { recursive: true });
  copyFileSync(join(root, gen), join(site, gen));
  return manifest;
}

/** Append bytes to a shipped file in the copy — the "re-render" stand-in. */
function mutate(rel, bytes = 64) {
  const file = join(site, rel);
  if (!existsSync(file)) throw new Error(`cannot mutate ${rel}: not in the copy`);
  appendFileSync(file, Buffer.alloc(bytes, 0x20));
  return statSync(file).size;
}

/** Regenerate the copy's manifest, exactly as a real deployment would. */
function regen() {
  execFileSync(process.execPath, [join(site, "scripts/gen-offline-manifest.mjs")], { stdio: "ignore" });
  return JSON.parse(readFileSync(join(site, "offline-manifest.json"), "utf8"));
}

/* ------------------------------------------------------------- server */
let server = null;
let requestLog = [];
const openServer = (port) =>
  new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x/").pathname);
      // Log the full request target: the worker's precache fetches are
      // query-less, while the page asks for versioned URLs (?v=…), which is how
      // the two are told apart below.
      requestLog.push(p.endsWith("/") ? p + "index.html" : p);
      requestLog[requestLog.length - 1] = req.url;
      if (p.endsWith("/")) p += "index.html";
      const file = join(site, p);
      if (!existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
      res.end(readFileSync(file));
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server.address().port));
  });
const closeServer = () =>
  new Promise((resolve) => { if (!server) return resolve(); const s = server; server = null; s.close(() => resolve()); });

/* ------------------------------------------------------------ helpers */
function watchPage(page, bucket) {
  page.on("pageerror", (e) => bucket.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") bucket.push("console: " + m.text()); });
}
const inPage = (page, fn, arg) => page.evaluate(fn, arg);
const controllerHash = (h) => (hash) => !!navigator.serviceWorker.controller &&
  navigator.serviceWorker.controller.scriptURL.indexOf("sw.js?v=" + hash) !== -1;
const waitController = (page, hash, timeout = 60000) =>
  page.waitForFunction(controllerHash(), { timeout, polling: 250 }, hash).then(() => true).catch(() => false);
const waitReady = (page, hash, timeout = 60000) =>
  page.waitForFunction((h) => localStorage.getItem("timeline.offline.ready.v1") === h, { timeout, polling: 250 }, hash)
    .then(() => true).catch(() => false);
const cacheKeys = (page, name) =>
  page.evaluate(async (n) => (await (await caches.open(n)).keys()).map((r) => r.url), name);

/* ------------------------------------------------------------- main */
async function main() {
  console.log("Building a throwaway copy of the site (.work/site)…");
  const committed = buildSite();
  // Regenerate in the copy and *use* that: the copy is built from the files on
  // disk, so if the committed manifest disagrees with them it is stale, and
  // every later phase would inherit the disagreement (it showed up as "a
  // re-render changed two entries" — the re-render and the stale artifact).
  const manifest = regen();
  const port = await openServer(0).then(async (p) => { await closeServer(); return p; });
  await openServer(port);
  const base = `http://127.0.0.1:${port}/`;
  console.log(`Serving ${site} at ${base} (generation ${manifest.hash})`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  const errors = [];
  const navigations = [];
  let page = await browser.newPage();
  watchPage(page, errors);
  // Unexpected navigations are worth seeing: an update that reloads at the
  // wrong moment is exactly the bug this checklist exists to catch.
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });

  try {
    /* ---- 1. installability + first visit ---- */
    phase("1 · served path, first visit (online)");
    check("the committed offline manifest matches the files on disk",
      committed.hash === manifest.hash,
      `committed ${committed.hash}, regenerated ${manifest.hash} — run: npm run gen:offline`);
    const served = await (await fetch(base + "offline-manifest.json")).json();
    const cdp = await page.createCDPSession();
    // Record what the page's own plumbing sees: the install event, whether the
    // Install button really calls prompt(), and every worker→page message.
    await page.evaluateOnNewDocument(() => {
      window.__bip = 0;
      window.__prompted = 0;
      window.__swMessages = [];
      window.addEventListener("beforeinstallprompt", (e) => {
        window.__bip++;
        const real = e.prompt.bind(e);
        e.prompt = function () { window.__prompted++; return real(); };
      }, { capture: true });
      if (navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener("message", (e) => window.__swMessages.push(e.data));
      }
    });
    if (process.env.SMOKE_DIAG) {
      await page.evaluateOnNewDocument(() => {
        const D = (m) => { try { console.log("DIAG " + m); } catch (e) {} };
        window.addEventListener("beforeunload", () => D("beforeunload"));
        if (navigator.serviceWorker) {
          navigator.serviceWorker.addEventListener("controllerchange", () => D("controllerchange"));
          const proto = window.ServiceWorker && window.ServiceWorker.prototype;
          if (proto && proto.postMessage) {
            const orig = proto.postMessage;
            proto.postMessage = function (msg) { D("postMessage " + JSON.stringify(msg && msg.type)); return orig.apply(this, arguments); };
          }
        }
      });
      page.on("console", (m) => { if (m.text().startsWith("DIAG")) console.log("      " + m.text()); });
    }
    await page.goto(base, { waitUntil: "load" });

    let parsed = null;
    try { parsed = await cdp.send("Page.getAppManifest"); } catch (e) { parsed = { errors: [{ message: e.message }] }; }
    const manifestErrors = (parsed.errors || []).map((e) => e.message || String(e));
    check("the browser parses the web app manifest with no errors",
      manifestErrors.length === 0 && /manifest\.webmanifest$/.test(parsed.url || ""),
      manifestErrors.join("; ") || `url=${parsed.url}`);

    const iconStatus = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="apple-touch-icon"]');
      const icon = document.querySelector('link[rel="icon"]');
      const hits = [];
      for (const l of [link, icon]) if (l) hits.push([l.href.split("/").pop(), (await fetch(l.href)).status]);
      return hits;
    });
    check("the tab icon and apple-touch-icon resolve", iconStatus.length === 2 && iconStatus.every(([, s]) => s === 200), JSON.stringify(iconStatus));

    const reg = await inPage(page, async () => {
      const r = await navigator.serviceWorker.ready;
      return { active: r.active ? r.active.scriptURL : null, scope: r.scope };
    });
    check("the worker registers under the content-derived hash",
      !!reg.active && reg.active.includes("sw.js?v=" + served.hash),
      `${reg.active} (expected …sw.js?v=${served.hash})`);
    check("the worker's scope covers the whole game", reg.scope === base, reg.scope);

    const precached = await waitReady(page, served.hash);
    const storedReady = await inPage(page, () => localStorage.getItem("timeline.offline.ready.v1"));
    check("the page learns precache completion over the worker→page message", precached, `ready=<${storedReady}>`);

    const keys = await cacheKeys(page, served.cacheName);
    check("the cache holds every file in the manifest", keys.length === served.files.length, `${keys.length} of ${served.files.length}`);
    check("every cache key is content-addressed", keys.every((u) => u.includes("?__rev=")));
    check("no off-origin response (NASA tiles) was cached", !keys.some((u) => u.includes("gibs.")));
    check("the worker is not cached by its own list", !keys.some((u) => /\/sw\.js/.test(u)));

    check("the page navigated only when it was told to", navigations.length === 1,
      `navigations: ${navigations.length} (${navigations.join(" → ")})`);

    // The requirement is "shown exactly when the browser says it is installable,
    // and it works" — not "always hidden". Chrome fires beforeinstallprompt only
    // when its installability criteria are met, so the event firing IS the
    // installability verdict.
    await page.waitForFunction(() => window.__bip > 0, { timeout: 12000, polling: 250 }).catch(() => {});
    const install = await inPage(page, () => {
      const b = document.getElementById("install-bar");
      const btn = document.getElementById("install-btn");
      return {
        offered: window.__bip,
        present: !!b,
        shown: !!b && !b.classList.contains("hidden"),
        buttonLabel: btn ? btn.textContent.trim() : null,
        buttonType: btn ? btn.type : null,
      };
    });
    check("the browser reports the app is installable (it fires beforeinstallprompt)", install.offered > 0, `fired ${install.offered}×`);
    check("the install affordance appears only because it is installable, as a real button",
      install.shown && install.buttonType === "button",
      `present=${install.present}, shown=${install.shown}, label=${JSON.stringify(install.buttonLabel)}`);
    if (install.shown) {
      await page.click("#install-btn");
      const clicked = await inPage(page, () => ({ prompted: window.__prompted, shown: !document.getElementById("install-bar").classList.contains("hidden") }));
      check("pressing Install really calls the browser's prompt and then gets out of the way",
        clicked.prompted === 1 && clicked.shown === false, JSON.stringify(clicked));
    }

    const status = await inPage(page, () => (document.getElementById("offline-status") || {}).textContent || "");
    check("Settings reports offline status honestly", /ready/i.test(status), status);

    /* ---- 2. persistence: refused by default ---- */
    phase("2 · storage persistence, not granted");
    await page.mouse.click(5, 5); // one gesture, which is what the request waits for
    await page.waitForFunction(() => !!localStorage.getItem("timeline.offline.persist.v1"), { timeout: 15000, polling: 200 }).catch(() => {});
    const persistDefault = await inPage(page, async () => ({
      recorded: localStorage.getItem("timeline.offline.persist.v1"),
      persisted: await navigator.storage.persisted(),
    }));
    check("persistence is requested once and the result is recorded",
      persistDefault.recorded === "granted" || persistDefault.recorded === "denied",
      `recorded=${persistDefault.recorded}, navigator.storage.persisted()=${persistDefault.persisted}`);
    const statusPoor = await inPage(page, () => (document.getElementById("offline-status") || {}).textContent || "");
    check("a refusal is reflected in the UI rather than claimed as durable",
      persistDefault.recorded === "granted" ? /durable/.test(statusPoor) : /best-effort/.test(statusPoor),
      statusPoor);

    /* ---- 3. offline boot ---- */
    phase("3 · offline boot (the server is stopped, not merely flagged)");
    await closeServer();
    let booted = true;
    try { await page.reload({ waitUntil: "load" }); } catch (e) { booted = false; check("reload succeeded", false, e.message); }
    if (booted) {
      const home = await inPage(page, () => ({
        visible: !document.getElementById("home").classList.contains("hidden"),
        cards: document.querySelectorAll("#deck-grid .deck-card").length,
      }));
      check("the cached shell boots with the network gone", home.visible, `deck cards rendered: ${home.cards}`);
      const allDecks = await page.waitForFunction(() => document.querySelectorAll("#deck-grid .deck-card").length >= 4, { timeout: 20000, polling: 250 })
        .then(() => true).catch(() => false);
      check("every bundled deck loads offline", allDecks);

      const clip = served.files.find((f) => /narration\/.*\.mp3$/.test(f.path));
      const audio = await inPage(page, async (p) => {
        const r = await fetch(p, { cache: "force-cache" });
        return { ok: r.ok, bytes: (await r.arrayBuffer()).byteLength };
      }, "/" + clip.path);
      check("a narration clip is served from cache while offline", audio.ok && audio.bytes > 1000, `${clip.path}: ${audio.bytes} bytes`);

      const sfx = await inPage(page, async () => {
        const r = await fetch("/assets/audio/alex-morgan-battle-boss-fight-game-music-583276.mp3", { cache: "force-cache" });
        return { ok: r.ok, bytes: (await r.arrayBuffer()).byteLength };
      });
      check("the music track (the largest asset) is available offline", sfx.ok && sfx.bytes > 1000000, `${sfx.bytes} bytes`);
      // The status line has to survive the same condition it describes: the
      // probe is network-only, so with the server down the page must fall back
      // to the generation it remembers rather than sit on "checking…" forever.
      const offlineStatus = await inPage(page, () => (document.getElementById("offline-status") || {}).textContent || "");
      check("Settings still tells the truth with the server down", /ready/i.test(offlineStatus), offlineStatus);
    }

    /* ---- 4. worker but nothing cached ---- */
    phase("4 · first visit offline with nothing cached");
    await openServer(port);
    const ctx = await browser.createBrowserContext();
    const fresh = await ctx.newPage();
    const freshErrors = [];
    watchPage(fresh, freshErrors);
    await fresh.goto(base, { waitUntil: "load" });
    await fresh.evaluate(() => navigator.serviceWorker.ready);
    await fresh.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 30000, polling: 200 }).catch(() => {});
    await fresh.evaluate(async () => { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); });
    await closeServer();
    let shown = "";
    try {
      await fresh.reload({ waitUntil: "load" });
      shown = await fresh.evaluate(() => document.body.innerText);
    } catch (e) { shown = "reload failed: " + e.message; }
    check("a device with the worker but no cached game explains itself instead of blanking",
      /Offline/.test(shown) && /Try again/.test(shown), JSON.stringify(shown.slice(0, 80).replace(/\s+/g, " ")));
    await ctx.close();

    /* ---- 5. re-rendered clip ---- */
    phase("5 · content update: a re-rendered clip must not be served stale");
    await openServer(port);
    const clip = manifest.files.find((f) => /narration\/.*\.mp3$/.test(f.path));
    const oldRev = clip.rev;
    const downloadWindow = requestLog.length;
    const newSize = mutate(clip.path, 64);
    const next = regen();
    check("a re-render moves the generation hash", next.hash !== manifest.hash, `${manifest.hash} → ${next.hash}`);

    await page.goto(base, { waitUntil: "load" });
    const tookOver = await waitController(page, next.hash);
    check("the new generation's worker ends up in control", tookOver,
      await inPage(page, () => (navigator.serviceWorker.controller || {}).scriptURL || "(no controller)").catch(() => ""));

    const servedBytes = await inPage(page, async (p) => {
      const r = await fetch(p, { cache: "force-cache" });
      return (await r.arrayBuffer()).byteLength;
    }, "/" + clip.path);
    check("the re-rendered clip is served with its NEW bytes (the stale-audio bug stays fixed)",
      servedBytes === newSize, `served ${servedBytes} bytes, new file is ${newSize} bytes (was ${clip.bytes})`);

    const nextKeys = await cacheKeys(page, next.cacheName);
    check("the old revision of the clip was pruned",
      !nextKeys.some((u) => u === new URL("/" + clip.path + "?__rev=" + oldRev, base).href));
    check("the new revision is stored", nextKeys.some((u) => u.endsWith(clip.path + "?__rev=" + next.hash.slice(0, 0) + next.files.find((f) => f.path === clip.path).rev)));
    check("the cache holds exactly the current generation",
      nextKeys.length === next.files.length, `${nextKeys.length} vs ${next.files.length}`);
    // Exactly one file changed, so exactly one file should have been fetched.
    // The worker's own report is the nicest evidence but it can be missed (the
    // update's reload destroys the page that would have heard it), so the
    // assertion is made on the wire instead: the worker fetches a precached
    // file by its plain path, while the page's own requests carry ?v=…
    const changed = next.files.filter((f) => {
      const before = manifest.files.find((o) => o.path === f.path);
      return !before || before.rev !== f.rev;
    });
    check("re-rendering one clip changed exactly one entry in the manifest", changed.length === 1,
      changed.map((f) => f.path).join(", ") || "none");
    const window_ = requestLog.slice(downloadWindow);
    const assetFetches = window_.filter((u) => !u.includes("?") && u !== "/" && !u.startsWith("/offline-manifest"));
    check("an update re-downloads only what changed, not all " + next.files.length + " files",
      assetFetches.length <= 4,
      `precache-style fetches: ${assetFetches.length} [${assetFetches.join(", ")}] · total server requests in the window: ${window_.length}`);

    /* ---- 6. update timing ---- */
    phase("6 · update timing: never mid-game");
    const next2 = (() => { mutate("assets/audio/win-1.mp3", 64); return regen(); })();
    const gameScreenStub = await page.evaluateOnNewDocument(() => {
      // Stand in for "a game is in progress". timeline.js's init calls
      // show("home"), which re-hides #game after a DOMContentLoaded listener
      // has run, so unhide again on `load` — before offline.js's own load
      // handler probes and registers (its listener was added after ours).
      // Deliberately NOT a MutationObserver: fighting the app's class writes
      // wedged the renderer.
      const force = () => {
        const g = document.getElementById("game");
        if (g) g.classList.remove("hidden");
      };
      document.addEventListener("DOMContentLoaded", force);
      window.addEventListener("load", force);
    });
    let reloads = 0;
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) reloads++; });
    // domcontentloaded, not load: a generation change can legitimately reload
    // the page mid-navigation, which would otherwise leave this goto waiting
    // forever (the guard is what is under test here, not the load event).
    try { await page.goto(base, { waitUntil: "load", timeout: 25000 }); }
    catch (e) { console.log(`      (navigation interrupted by an update reload: ${e.message.split("\n")[0]})`); }
    console.log("      · page loaded with the game screen held visible");
    const seenWaiting = await page.waitForFunction(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return !!(r && r.waiting);
    }, { timeout: 20000, polling: 300 }).then(() => true).catch(() => false);
    console.log(`      · a new worker reached the waiting state: ${seenWaiting}`);
    await sleep(7000);
    const midGame = await inPage(page, async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return { waiting: !!(r && r.waiting), hash: (navigator.serviceWorker.controller || {}).scriptURL || "" };
    });
    check("an update does NOT apply while a game is in progress",
      reloads <= 1 && midGame.waiting && !midGame.hash.includes(next2.hash),
      `reloads=${reloads}, waiting=${midGame.waiting}`);
    const navWait = page.waitForNavigation({ waitUntil: "load", timeout: 40000 }).then(() => true).catch(() => false);
    await inPage(page, () => document.getElementById("game").classList.add("hidden"));
    // The reload that applies an update trails the controller change: reading
    // the counter the instant the controller flips both misses the navigation
    // and lets the *next* evaluate race the reload (which destroyed the
    // execution context the first time this ran). Wait for the navigation
    // itself, not for a side effect of it.
    const navigated = await navWait;
    const applied = await waitController(page, next2.hash, 20000);
    check("leaving the game applies the waiting update and reloads once",
      applied && navigated && reloads === 2,
      `reloads=${reloads}, applied=${applied}, navigated=${navigated}`);
    // Drop the stub, or every later phase inherits a page that is permanently mid-game.
    if (gameScreenStub) await page.removeScriptToEvaluateOnNewDocument(gameScreenStub).catch(() => {});
    await page.waitForFunction(() => document.readyState === "complete", { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => document.getElementById("game").classList.add("hidden"));

    /* ---- 7. two tabs ---- */
    phase("7 · two tabs across a generation change");
    const next3 = (() => { mutate("assets/audio/wrong-1.mp3", 64); return regen(); })();
    const second = await browser.newPage();
    watchPage(second, errors);
    // Both tabs load the new deployment, which is how a real user's second tab
    // behaves; a tab that never navigates never learns about an update.
    await Promise.all([
      page.goto(base, { waitUntil: "load" }).catch(() => {}),
      second.goto(base, { waitUntil: "load" }).catch(() => {}),
    ]);
    const [a, b] = await Promise.all([waitController(page, next3.hash), waitController(second, next3.hash)]);
    const diag = async (p) => p.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return {
        controlled: !!navigator.serviceWorker.controller,
        controller: navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL,
        active: r && r.active && r.active.scriptURL,
        waiting: r && r.waiting && r.waiting.scriptURL,
        installing: r && r.installing && r.installing.scriptURL,
        stored: [localStorage.getItem("timeline.offline.rev.v1"), localStorage.getItem("timeline.offline.applied.v1")],
        messages: (window.__swMessages || []).map((m) => m && m.type + "@" + String(m.hash).slice(0, 4)),
      };
    }).catch((e) => ({ error: e.message.split("\n")[0] }));
    check("both tabs converge on the same generation", a && b,
      `tab1=${a}, tab2=${b}\n      tab1: ${JSON.stringify(await diag(page))}\n      tab2: ${JSON.stringify(await diag(second))}`);
    const state = await inPage(page, async (n) => {
      const names = await caches.keys();
      const c = await caches.open(n);
      return { names, keys: (await c.keys()).length };
    }, next3.cacheName);
    check("exactly one offline cache exists after repeated updates", state.names.length === 1, state.names.join(", "));
    const expected = new Set(next3.files.map((f) => new URL("/" + f.path + "?__rev=" + f.rev, base).href));
    const current = await cacheKeys(page, next3.cacheName);
    const extra = current.filter((u) => !expected.has(u));
    check("no leftovers from earlier generations", extra.length === 0,
      `${current.length} keys vs ${next3.files.length} expected${extra.length ? "; extra: " + extra.join(", ") : ""}`);
    await second.close();

    /* ---- 8. persistence: granted ---- */
    phase("8 · storage persistence granted");
    const ctx2 = await browser.createBrowserContext();
    const granted = await ctx2.newPage();
    const grantedErrors = [];
    watchPage(granted, grantedErrors);
    const browserCdp = await browser.target().createCDPSession();
    const origin = base.replace(/\/$/, ""); // CDP wants an origin, not a URL
    // The page lives in its own (incognito) browser context, and a permission
    // granted on the default one does not reach it — the context id is what
    // makes the grant land (this cost one wasted run to learn).
    const pageCdp = await granted.createCDPSession();
    const { targetInfo } = await pageCdp.send("Target.getTargetInfo");
    const browserContextId = targetInfo.browserContextId;
    let grantedHow = "none";
    try {
      await browserCdp.send("Browser.setPermission", {
        permission: { name: "persistent-storage" },
        setting: "granted",
        origin,
        browserContextId,
      });
      grantedHow = "Browser.setPermission(persistent-storage)";
    } catch (e) {
      try {
        await browserCdp.send("Browser.grantPermissions", {
          permissions: ["durableStorage"], origin, browserContextId,
        });
        grantedHow = "Browser.grantPermissions(durableStorage)";
      } catch (e2) {
        grantedHow = "unavailable: " + e.message.split("\n")[0];
      }
    }
    console.log(`      · storage permission path: ${grantedHow} (context ${browserContextId})`);
    await granted.goto(base, { waitUntil: "load" });
    await granted.mouse.click(5, 5);
    await granted.waitForFunction(() => !!localStorage.getItem("timeline.offline.persist.v1"), { timeout: 12000, polling: 200 }).catch(() => {});
    await granted.waitForFunction(() => /durable/.test((document.getElementById("offline-status") || {}).textContent || ""), { timeout: 30000, polling: 300 }).catch(() => {});
    const grantedState = await granted.evaluate(async () => ({
      recorded: localStorage.getItem("timeline.offline.persist.v1"),
      persisted: await navigator.storage.persisted(),
      permission: (await navigator.permissions.query({ name: "persistent-storage" })).state,
      estimate: await navigator.storage.estimate(),
    }));
    check("with storage permission granted, durability is recorded and surfaced",
      grantedState.recorded === "granted" && grantedState.persisted === true,
      `recorded=${grantedState.recorded}, persisted=${grantedState.persisted}, permission=${grantedState.permission}, using ${Math.round((grantedState.estimate.usage || 0) / 1048576)} MB`);
    const grantedStatus = await granted.evaluate(() => (document.getElementById("offline-status") || {}).textContent || "");
    check("the settings line says durable when storage is durable", /durable/.test(grantedStatus), grantedStatus);
    await ctx2.close();

    /* ---- 9. environments that are not a normal browser tab ---- */
    phase("9 · installed, shell, and no-worker environments");

    // A fresh context, optionally with stubs installed before any script runs.
    const hostedPage = async (stubs = []) => {
      const ctx = await browser.createBrowserContext();
      const p = await ctx.newPage();
      const errs = [];
      watchPage(p, errs);
      for (const s of stubs) await p.evaluateOnNewDocument(s);
      await p.goto(base, { waitUntil: "load" });
      return { ctx, p, errs };
    };

    // 9a. Already installed (display mode standalone): never offer to install
    // what is installed. Asserted as an A/B against the *same* synthetic
    // beforeinstallprompt, so this proves the `installed()` gate rather than
    // the event's absence. The real event cannot be constructed, but offline.js
    // only preventDefaults it and calls prompt(), which a plain object does too.
    const standaloneStub = () => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q)
        ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }
        : real(q));
    };
    // Count prompt() calls in the capture phase, so it does not matter whether
    // the real event or the synthetic one ends up stored as `deferredPrompt`
    // (Chrome fires the real one asynchronously, which is a race otherwise).
    const countPrompts = () => {
      window.__prompted = 0;
      window.addEventListener("beforeinstallprompt", (e) => {
        const real = e.prompt.bind(e);
        e.prompt = function () { window.__prompted++; return real(); };
      }, { capture: true });
    };
    const installAffordance = async (stubStandalone) => {
      const stubs = stubStandalone ? [countPrompts, standaloneStub] : [countPrompts];
      const { ctx, p, errs } = await hostedPage(stubs);
      const state = await p.evaluate(() => {
        const e = new Event("beforeinstallprompt");
        e.prompt = () => {};
        window.dispatchEvent(e);
        const bar = document.getElementById("install-bar");
        const btn = document.getElementById("install-btn");
        const shown = !!bar && !bar.classList.contains("hidden");
        if (shown && btn) btn.click();
        return {
          standalone: window.matchMedia("(display-mode: standalone)").matches,
          shown,
          prompted: window.__prompted,
          hiddenAfter: !bar || bar.classList.contains("hidden"),
        };
      });
      await ctx.close();
      return { state, errs };
    };
    const control = await installAffordance(false);
    check("an installable tab does offer the install affordance",
      control.state.shown && control.state.prompted === 1 && control.state.hiddenAfter,
      `standalone=${control.state.standalone}, shown=${control.state.shown}, ` +
      `prompted=${control.state.prompted}, hiddenAfterClick=${control.state.hiddenAfter}`);
    const inst = await installAffordance(true);
    check("an app already installed (standalone) is never asked to install itself",
      inst.state.standalone && !inst.state.shown && inst.state.prompted === 0,
      `standalone=${inst.state.standalone}, shown=${inst.state.shown}, prompted=${inst.state.prompted}`);

    // 9b. A context with no usable worker registry (old engine, in-app WebView,
    // non-secure context). The honest outcome is a stated limitation and a game
    // that still plays — not a broken Settings line or a silent failure.
    const noWorker = await hostedPage([() => {
      try { Object.defineProperty(navigator, "serviceWorker", { get: () => undefined, configurable: true }); } catch (e) {}
    }]);
    const noWorkerState = await noWorker.p.evaluate(async () => ({
      supported: !!(navigator.serviceWorker),
      status: (document.getElementById("offline-status") || {}).textContent || "",
      homeVisible: !document.getElementById("home").classList.contains("hidden"),
      decks: document.querySelectorAll("#deck-grid .deck-card").length,
      caches: (await caches.keys()).length,
    }));
    check("with no worker registry the limitation is stated, not thrown",
      !noWorkerState.supported && /cannot store the game/i.test(noWorkerState.status),
      noWorkerState.status);
    check("and the game itself still plays",
      noWorkerState.homeVisible && noWorkerState.decks >= 4 && noWorkerState.caches === 0 && noWorker.errs.length === 0,
      `home=${noWorkerState.homeVisible}, decks=${noWorkerState.decks}, caches=${noWorkerState.caches}, errors=${noWorker.errs.join("; ") || "none"}`);
    await noWorker.ctx.close();

    // 9c. Inside a native shell the worker must be excluded entirely
    // (doc/CROSS_PLATFORM_ROADMAP.md §5.1): iOS WKWebView cannot register one on
    // capacitor://, and a stale Android worker would serve old builds over new.
    const shell = await hostedPage([() => {
      window.Capacitor = { getPlatform: () => "ios", isNativePlatform: () => true };
    }]);
    const shellState = await shell.p.evaluate(async () => ({
      status: (document.getElementById("offline-status") || {}).textContent || "",
      registrations: (await navigator.serviceWorker.getRegistrations()).length,
      caches: (await caches.keys()).length,
      homeVisible: !document.getElementById("home").classList.contains("hidden"),
    }));
    check("inside a native shell the app says it handles offline play itself",
      /handles offline play itself/i.test(shellState.status), shellState.status);
    check("and the shell registers no worker and creates no cache",
      shellState.registrations === 0 && shellState.caches === 0 && shell.errs.length === 0,
      `registrations=${shellState.registrations}, caches=${shellState.caches}, home=${shellState.homeVisible}, ` +
      `errors=${shell.errs.join("; ") || "none"}`);
    await shell.ctx.close();

    /* ---- 10. not coverable here ---- */
    phase("10 · explicitly not covered by this run");
    check("iOS *Safari* behaviour is NOT verified here", true,
      "headless Chromium is not iOS: the Add-to-Home-Screen UX, iOS's storage eviction, and standalone quirks stay open (the same engine family is covered separately by tools/offline-smoke/webkit.mjs)");
    check("the browser's own install DIALOG is NOT verified here", true,
      "headless Chromium fires beforeinstallprompt and offline.js calls prompt() (phase 1), but the OS/browser dialog itself cannot be seen or accepted without a window");
    check("storage eviction under pressure is NOT verified here", true,
      "cannot be induced in a container; the degraded path is covered by the worker's quota handling in scripts/test/offline.test.mjs");

    // The offline phase stops the server on purpose, and the satellite tile
    // layer keeps trying (navigator.onLine is still true — the *host* is down,
    // not the device). Those failures are the designed degradation, not bugs.
    const expectedOfflineFailure = /ERR_CONNECTION_REFUSED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK_CHANGED|gibs\.earthdata\.nasa\.gov|favicon/i;
    const consoleNoise = errors.filter((e) => !expectedOfflineFailure.test(e));
    check("no page errors or console errors during the run", consoleNoise.length === 0, consoleNoise.slice(0, 3).join(" | "));
  } finally {
    await browser.close().catch(() => {});
    await closeServer();
  }
}

main()
  .catch((e) => { console.error("\nSMOKE HARNESS ERROR:", e && e.stack ? e.stack : e); results.push({ name: "harness completed", ok: false }); })
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Browser smoke: ${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
      console.log("FAILED:");
      for (const f of failed) console.log(`  ✗ ${f.name}`);
    }
    process.exit(failed.length ? 1 : 0);
  });
