#!/usr/bin/env node
/*
 * tools/offline-smoke/webkit.mjs
 * ------------------------------------------------------------------
 * The same offline layer, in a second engine.
 *
 *   npm --prefix tools/offline-smoke install
 *   npx --prefix tools/offline-smoke playwright install --with-deps webkit
 *   node tools/offline-smoke/webkit.mjs
 *
 * Why a second engine at all: Chromium's service worker is one implementation
 * of the spec, and this project's riskiest offline code (content-addressed
 * cache keys, `respondWith` for navigations, `clients.claim()` on activate,
 * pruning in `activate`) is exactly the surface engines disagree about.
 * WebKit is Safari's engine, and Safari is the browser most of the audience's
 * iPads run — so a pass here is the strongest available evidence for the
 * iOS branch of the checklist.
 *
 * What it is NOT: iOS. WebKit-on-Linux has no Add-to-Home-Screen flow, no
 * `navigator.standalone`, no iOS storage eviction, and iOS Safari's UIWebView
 * quirks do not exist outside iOS. Those stay open and are reported as such at
 * the end (the same honesty rule as smoke.mjs: a check that could not run must
 * never report clean).
 *
 * Author-time tooling, never shipped (AGENTS.md rule 1 scope note). Mutations
 * happen in a COPY of the site (.work/site), never in the repo.
 */
import { createServer } from "node:http";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { webkit } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const site = join(here, ".work", "site-webkit");

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
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".mp3": "audio/mpeg", ".jpg": "image/jpeg",
};

function buildSite(manifest) {
  rmSync(site, { recursive: true, force: true });
  const needed = new Set(manifest.files.map((f) => f.path));
  for (const extra of ["sw.js", "offline-manifest.json", "offline-manifest.js"]) needed.add(extra);
  for (const rel of needed) {
    const from = join(root, rel);
    if (!existsSync(from)) throw new Error(`site copy: ${rel} is missing in the repo`);
    const to = join(site, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
}

let server = null;
const responses = [];
const openServer = (port) =>
  new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x/").pathname);
      if (p.endsWith("/")) p += "index.html";
      const file = join(site, p);
      if (!existsSync(file) || statSync(file).isDirectory()) {
        responses.push([404, req.url]);
        res.writeHead(404); res.end("not found"); return;
      }
      responses.push([200, req.url]);
      res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
      res.end(readFileSync(file));
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server.address().port));
  });
const closeServer = () =>
  new Promise((resolve) => { if (!server) return resolve(); const s = server; server = null; s.close(() => resolve()); });

/* ------------------------------------------------------------- main */
async function main() {
  const manifest = JSON.parse(readFileSync(join(root, "offline-manifest.json"), "utf8"));
  buildSite(manifest);
  const port = await openServer(0).then(async (p) => { await closeServer(); return p; });
  await openServer(port);
  const base = `http://127.0.0.1:${port}/`;
  console.log(`Serving ${site} at ${base} (generation ${manifest.hash})`);

  const browser = await webkit.launch();
  const context = await browser.newContext();
  const errors = [];
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  // Count beforeinstallprompt: Safari never fires it, so the install affordance
  // must stay hidden rather than sit there as a dead button.
  await context.addInitScript(() => {
    window.__bip = 0;
    window.addEventListener("beforeinstallprompt", () => { window.__bip++; }, { capture: true });
  });

  try {
    /* ---- 1. boots, and the iOS-facing head is complete ---- */
    phase("1 · WebKit (Safari's engine) boots the game");
    await page.goto(base, { waitUntil: "load" });
    const home = await page.evaluate(() => ({
      visible: !document.getElementById("home").classList.contains("hidden"),
      cards: document.querySelectorAll("#deck-grid .deck-card").length,
    }));
    check("the game boots in WebKit", home.visible, `deck cards: ${home.cards}`);
    const ready = await page.waitForFunction(() => document.querySelectorAll("#deck-grid .deck-card").length >= 4, null, { timeout: 20000, polling: 250 })
      .then(() => true).catch(() => false);
    check("every bundled deck loads in WebKit", ready);

    // Safari reads these, not all of the manifest — an installed iOS home-screen
    // app gets its name and icon from the meta tags / apple-touch-icon.
    const head = await page.evaluate(async () => {
      const get = (sel, attr) => { const el = document.querySelector(sel); return el ? (attr ? el.getAttribute(attr) : el.href) : null; };
      const fetchStatus = async (href) => (href ? (await fetch(href)).status : 0);
      return {
        appleIcon: await fetchStatus(get('link[rel="apple-touch-icon"]')),
        tabIcon: await fetchStatus(get('link[rel="icon"]')),
        manifestStatus: await fetchStatus(get('link[rel="manifest"]')),
        title: get('meta[name="apple-mobile-web-app-title"]', "content"),
        capable: get('meta[name="apple-mobile-web-app-capable"]', "content"),
        barStyle: get('meta[name="apple-mobile-web-app-status-bar-style"]', "content"),
        themeColor: get('meta[name="theme-color"]', "content"),
      };
    });
    check("the iOS touch icon, tab icon and manifest all resolve",
      [head.appleIcon, head.tabIcon, head.manifestStatus].every((s) => s === 200),
      JSON.stringify([head.appleIcon, head.tabIcon, head.manifestStatus]));
    check("the iOS home-screen meta tags are present",
      head.title === "Timeline Game" && head.capable === "yes" && !!head.barStyle && !!head.themeColor,
      `title=${head.title}, capable=${head.capable}, barStyle=${head.barStyle}, themeColor=${head.themeColor}`);
    const mf = await page.evaluate(async () => {
      const r = await fetch("manifest.webmanifest");
      return { ok: r.ok, type: r.headers.get("content-type"), body: await r.json() };
    });
    check("the manifest is served with a manifest content type and parses",
      mf.ok && !!mf.body.name && mf.body.display === "standalone" && (mf.body.icons || []).length >= 3,
      `content-type=${mf.type}, icons=${(mf.body.icons || []).length}, display=${mf.body.display}`);

    const bip = await page.evaluate(() => window.__bip);
    const bar = await page.evaluate(() => {
      const b = document.getElementById("install-bar");
      return { present: !!b, shown: !!b && !b.classList.contains("hidden") };
    });
    check("Safari fires no install event, so no install button is offered (never a dead button)",
      bip === 0 && bar.present && !bar.shown,
      `beforeinstallprompt×${bip}, bar present=${bar.present}, shown=${bar.shown}`);
    const dm = await page.evaluate(() => {
      try { return { ok: true, standalone: window.matchMedia("(display-mode: standalone)").matches }; }
      catch (e) { return { ok: false, message: e.message }; }
    });
    check("the standalone display-mode query the app relies on is supported",
      dm.ok && dm.standalone === false, JSON.stringify(dm));

    /* ---- 2. worker + precache, in WebKit's implementation ---- */
    phase("2 · the worker precaches in WebKit");
    const reg = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      return { active: r.active ? r.active.scriptURL : null, scope: r.scope };
    });
    check("the worker registers under the content-derived hash",
      !!reg.active && reg.active.includes("sw.js?v=" + manifest.hash), `${reg.active}`);
    const precached = await page.waitForFunction(
      (h) => localStorage.getItem("timeline.offline.ready.v1") === h, manifest.hash, { timeout: 90000, polling: 300 })
      .then(() => true).catch(() => false);
    check("WebKit finishes precaching the whole payload", precached,
      `ready=${await page.evaluate(() => localStorage.getItem("timeline.offline.ready.v1"))}`);
    const cache = await page.evaluate(async (name) => {
      const keys = (await (await caches.open(name)).keys()).map((r) => r.url);
      return { count: keys.length, addressed: keys.every((u) => u.includes("?__rev=")), offOrigin: keys.some((u) => u.includes("gibs.")) };
    }, manifest.cacheName);
    check("the cache holds every file, content-addressed, with no off-origin entries",
      cache.count === manifest.files.length && cache.addressed && !cache.offOrigin,
      `${cache.count} of ${manifest.files.length} keys, all addressed=${cache.addressed}`);
    const status = await page.evaluate(() => (document.getElementById("offline-status") || {}).textContent || "");
    check("Settings reports offline readiness in Safari's engine", /ready/i.test(status), status);

    /* ---- 3. offline boot, server actually stopped ---- */
    phase("3 · offline boot in WebKit (the server is stopped)");
    await closeServer();
    let booted = true;
    try { await page.reload({ waitUntil: "load", timeout: 30000 }); } catch (e) { booted = false; check("reload with the network gone", false, e.message.split("\n")[0]); }
    if (booted) {
      const offlineHome = await page.waitForFunction(
        () => !document.getElementById("home").classList.contains("hidden") &&
          document.querySelectorAll("#deck-grid .deck-card").length >= 4, null, { timeout: 25000, polling: 250 })
        .then(() => true).catch(() => false);
      check("the cached shell boots offline and every deck is there", offlineHome);
      const clip = manifest.files.find((f) => /narration\/.*\.mp3$/.test(f.path));
      const clipBytes = statSync(join(site, clip.path)).size;
      const audio = await page.evaluate(async (p) => {
        const r = await fetch(p, { cache: "force-cache" });
        return { ok: r.ok, bytes: (await r.arrayBuffer()).byteLength };
      }, "/" + clip.path);
      check("a narration clip is served from cache while offline",
        audio.ok && audio.bytes === clipBytes && clipBytes > 1000,
        `${clip.path}: ${audio.bytes} of ${clipBytes} bytes`);
      const musicPath = manifest.files.filter((f) => /\.mp3$/.test(f.path)).sort((a, b) => b.bytes - a.bytes)[0];
      const music = await page.evaluate(async (p) => {
        const r = await fetch(p, { cache: "force-cache" });
        return { ok: r.ok, bytes: (await r.arrayBuffer()).byteLength };
      }, "/" + musicPath.path);
      check("the largest asset (music) is available offline too",
        music.ok && music.bytes === musicPath.bytes,
        `${musicPath.path}: ${music.bytes} of ${musicPath.bytes} bytes`);
      const offlineStatus = await page.evaluate(() => (document.getElementById("offline-status") || {}).textContent || "");
      check("Settings still speaks the truth with the network gone", /ready/i.test(offlineStatus), offlineStatus);
    }

    /* ---- 4. persistence, honestly reported ---- */
    phase("4 · storage persistence in WebKit");
    await page.mouse.click(5, 5);
    const recorded = await page.waitForFunction(() => !!localStorage.getItem("timeline.offline.persist.v1"), null, { timeout: 20000, polling: 250 })
      .then(() => page.evaluate(() => localStorage.getItem("timeline.offline.persist.v1"))).catch(() => null);
    const persisted = await page.evaluate(() => navigator.storage.persisted());
    const persistStatus = await page.evaluate(() => (document.getElementById("offline-status") || {}).textContent || "");
    check("the persistence result is recorded, and the UI matches it",
      (recorded === "granted" && persisted === true && /durable/.test(persistStatus)) ||
      (recorded === "denied" && /best-effort/.test(persistStatus)),
      `recorded=${recorded}, persisted=${persisted}, status=${persistStatus}`);

    check("WebKit served nothing missing (no 404s in the whole run)",
      !responses.some(([s]) => s === 404),
      responses.filter(([s]) => s === 404).map(([, u]) => u).join(", ") || "none");
    // The offline phase is *supposed* to have failed network requests: the
    // freshness probe is network-only by design, so WebKit logs a connection
    // refusal. Anything else — a JS exception, a broken asset — is a real
    // failure, and "/offline-manifest" 404s are already covered by the
    // server-side response log above.
    const unexpected = errors.filter((e) => !/Could not connect|Connection refused|ERR_CONNECTION|Failed to load resource/.test(e));
    check("no unexpected page errors or console errors during the run", unexpected.length === 0,
      unexpected.slice(0, 4).join("; ") || `none (${errors.length} expected offline network refusal(s))`);

    /* ---- 5. explicitly not covered ---- */
    phase("5 · explicitly not covered by this run");
    check("iOS Safari itself is NOT verified here", true,
      "this is WebKit on Linux: no Add-to-Home-Screen flow, no navigator.standalone, no iOS storage eviction. Those need a real iOS device or simulator");
    check("storage eviction under pressure is NOT verified here", true,
      "cannot be induced in a container; the worker's quota handling is pinned by scripts/test/offline.test.mjs");
  } finally {
    await browser.close().catch(() => {});
    await closeServer();
  }
}

main()
  .catch((e) => { console.error("\nSMOKE HARNESS ERROR:", e && e.stack ? e.stack : e); results.push({ name: "harness completed", ok: false }); })
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    console.log("\n" + "─".repeat(60));
    console.log(`WebKit smoke: ${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
      console.log("FAILED:");
      for (const f of failed) console.log("  ✗ " + f.name);
      process.exitCode = 1;
    }
  });
