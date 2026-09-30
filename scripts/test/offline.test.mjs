#!/usr/bin/env node
/*
 * scripts/test/offline.test.mjs
 * ------------------------------------------------------------------
 * The game has no DOM/browser test runner, but the offline layer's two
 * riskiest parts are both DOM-free and therefore testable here:
 *
 *   1. the generated precache manifest — is it complete (nothing the page
 *      asks for at boot is missing), fresh, and free of repo-only files?
 *   2. sw.js's routing decisions — which requests it intercepts, what it
 *      serves from cache, and what it does when the network is gone.
 *
 * The worker is loaded in a `vm` sandbox with a fake Cache Storage, a fake
 * `caches`/`fetch`, and a real `importScripts` stub that evaluates the
 * generated mirror. That exercises the shipped file rather than a copy, which
 * is the point: this is the only way to assert cache behaviour without a
 * browser, and a claim about offline that is not exercised is not a claim.
 *
 * What this CANNOT cover is what needs a real browser: the install prompt, the
 * actual SW lifecycle, real quota/eviction, and iOS. Those stay on the manual
 * checklist in AGENTS.md and are reported as "not verified" — never inferred
 * from a green run here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { createServer } from "node:http";
import { extname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const abs = (p) => join(root, p);
const manifest = JSON.parse(readFileSync(abs("offline-manifest.json"), "utf8"));
const paths = manifest.files.map((f) => f.path);

/* ---------------------------------------------------------------- helpers */

function pngSize(file) {
  const b = readFileSync(abs(file));
  const sig = b.subarray(0, 8).toString("hex");
  assert.equal(sig, "89504e470d0a1a0a", `${file} is not a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function pngPixels(file) {
  const b = readFileSync(abs(file));
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  let off = 8;
  const idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.subarray(off + 4, off + 8).toString("ascii");
    if (type === "IDAT") idat.push(b.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const out = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    assert.equal(raw[y * (stride + 1)], 0, "expected an unfiltered PNG row");
    raw.copy(out, y * stride, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
  }
  return { w, h, px: out };
}

/** Local (same-origin) references an HTML file needs at boot. */
function localRefs(html, baseFilter = () => true) {
  const out = new Set();
  const re = /(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const url = m[1];
    if (/^(https?:|data:|#|mailto:)/.test(url)) continue;
    const clean = url.split("?")[0].replace(/^\.\//, "").replace(/^\//, "");
    if (!clean || !baseFilter(clean)) continue;
    out.add(clean);
  }
  return [...out];
}

/* ------------------------------------------------- manifest: completeness */

test("every precached path exists, and its recorded size and revision are true", () => {
  for (const f of manifest.files) {
    const full = abs(f.path);
    assert.ok(existsSync(full), `${f.path} is listed but missing on disk`);
    const buf = readFileSync(full);
    assert.equal(buf.length, f.bytes, `${f.path}: recorded size is wrong`);
    assert.equal(
      createHash("sha256").update(buf).digest("hex").slice(0, 12),
      f.rev,
      `${f.path}: recorded revision does not match the bytes on disk`
    );
  }
});

test("the generation hash is derived from the file list, so any content change moves it", () => {
  const h = createHash("sha256");
  for (const f of manifest.files) h.update(f.path + "\0" + f.rev + "\n");
  assert.equal(h.digest("hex").slice(0, 12), manifest.hash);
});

test("the precache list carries no repo-only or dev-only file", () => {
  const deny = [/^doc\//, /^tools\//, /^content\//, /^scripts\//, /\.md$/, /\.mjs$/, /^package\.json$/, /^sw\.js$/, /^offline-manifest\./];
  for (const p of paths) {
    if (p === "manifest.webmanifest" || p === "decks/index.json") continue;
    for (const re of deny) assert.ok(!re.test(p), `${p} matches ${re} and must never be precached`);
  }
});

test("everything index.html asks for at boot is precached (offline boot cannot 404)", () => {
  const html = readFileSync(abs("index.html"), "utf8");
  const need = localRefs(html, (p) => p.endsWith(".js") || p.endsWith(".css") || p.endsWith(".png") || p.endsWith(".jpg") || p.endsWith(".webmanifest"));
  const missing = need.filter((p) => !paths.includes(p));
  assert.deepEqual(missing, [], `index.html needs files that are not precached: ${missing.join(", ")}`);
  assert.ok(need.includes("manifest.webmanifest"), "the manifest link should be resolvable offline");
});

test("every deck the generated index lists is precached, and so is its audio", () => {
  const index = JSON.parse(readFileSync(abs("decks/index.json"), "utf8"));
  for (const d of index.decks) {
    if (d.layout === "folder") {
      assert.ok(paths.includes(`decks/${d.dir}/${d.script}`), `${d.dir}: deck script is not precached`);
      const narration = (JSON.parse(readFileSync(abs(`decks/${d.dir}/deck.json`), "utf8")).narration || {}).files || {};
      for (const id of Object.keys(narration)) {
        const rec = narration[id];
        const file = typeof rec === "string" ? rec : rec.path;
        assert.ok(paths.includes(file), `${d.dir}: narration clip ${file} is not precached`);
      }
    } else {
      assert.ok(paths.includes(`decks/${d.file}`), `${d.file}: flat deck is not precached`);
    }
  }
});

test("the manifest payload stays inside the ratified budget", () => {
  // The owner ratified ~19 MB of offline payload. A silent doubling should
  // fail here rather than surprise a family on a metered connection.
  const MB = manifest.totalBytes / (1024 * 1024);
  assert.ok(MB > 10 && MB < 24, `offline payload is ${MB.toFixed(1)} MiB, outside the ratified ~19 MB budget`);
  const audio = manifest.files.filter((f) => /\.mp3$/.test(f.path)).reduce((n, f) => n + f.bytes, 0);
  assert.ok(audio / manifest.totalBytes > 0.5, "audio should be the bulk of the offline payload (it is what makes offline play worth having)");
});

/* ------------------------------------------------------- webmanifest/icons */

test("the web app manifest declares what installability requires", () => {
  const wm = JSON.parse(readFileSync(abs("manifest.webmanifest"), "utf8"));
  assert.ok(wm.name && wm.short_name, "name and short_name are required");
  assert.ok(wm.start_url, "start_url is required");
  assert.ok(wm.display === "standalone", "display must be standalone");
  assert.ok(wm.theme_color && wm.background_color, "theme and background colours are required");

  const sizes = new Set();
  for (const icon of wm.icons) {
    assert.ok(existsSync(abs(icon.src)), `${icon.src} is declared but missing`);
    const { width, height } = pngSize(icon.src);
    const [w, h] = icon.sizes.split("x").map(Number);
    assert.equal(width, w, `${icon.src}: declared width ${w} but the file is ${width}`);
    assert.equal(height, h, `${icon.src}: declared height ${h} but the file is ${height}`);
    sizes.add(icon.sizes);
  }
  assert.ok(sizes.has("192x192"), "a 192px icon is required");
  assert.ok(sizes.has("512x512"), "a 512px icon is required");
  assert.ok(wm.icons.some((i) => (i.purpose || "").includes("maskable")), "a maskable icon is required on Android");
});

test("the icons are real, distinct art — not placeholder duplicates", () => {
  const files = ["icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon-180.png"];
  const hashes = new Set();
  for (const f of files) {
    assert.ok(existsSync(abs(f)), `${f} is missing — run: npm run gen:icons`);
    hashes.add(createHash("sha256").update(readFileSync(abs(f))).digest("hex"));
  }
  assert.equal(hashes.size, files.length, "two icons are byte-identical; an install icon must not be a placeholder");

  // A maskable icon is full-bleed (no transparent corners); a `any` icon is
  // not. Getting this backwards is the classic "icon cropped by Android" bug.
  const maskable = pngPixels("icons/icon-maskable-512.png");
  assert.equal(maskable.px[3], 255, "the maskable icon must be opaque at the corner");
  const any = pngPixels("icons/icon-512.png");
  assert.equal(any.px[3], 0, "the non-maskable icon should have transparent corners");

  // And the art must actually be drawn: a flat fill would pass everything above.
  const colours = new Set();
  for (let i = 0; i < any.w * any.h; i++) colours.add(any.px[i * 4] + "," + any.px[i * 4 + 1] + "," + any.px[i * 4 + 2]);
  assert.ok(colours.size > 50, `the icon looks like a flat fill (${colours.size} colours)`);
});

/* ------------------------------------------------------- worker behaviour */

function loadWorker({ cached = [], server = new Set(), failFetch = new Set(), quotaExhausted = false } = {}) {
  const listeners = {};
  const store = new Map(); // cache key url -> Response
  const fetches = [];

  class FakeResponse {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status == null ? 200 : init.status;
      this.headers = init.headers || {};
      this.type = init.type || "basic";
      this.ok = this.status >= 200 && this.status < 300;
    }
    clone() { return new FakeResponse(this.body, { status: this.status, type: this.type, headers: this.headers }); }
    static error() { const r = new FakeResponse(null, { status: 0 }); r.ok = false; r.type = "error"; return r; }
  }
  class FakeRequest {
    constructor(url, init = {}) { this.url = url; this.method = (init.method || "GET"); this.cache = init.cache; }
  }

  const cacheObj = {
    match: async (key) => store.get(key) || undefined,
    put: async (key, res) => {
      if (quotaExhausted) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; }
      store.set(key, res);
    },
    keys: async () => [...store.keys()].map((url) => ({ url })),
    delete: async (req) => store.delete(req.url),
  };

  const sandbox = {
    console,
    URL,
    setTimeout,
    Promise,
    Object,
    Array,
    Error,
    Response: FakeResponse,
    Request: FakeRequest,
    caches: {
      open: async () => cacheObj,
      keys: async () => ["timeline-offline"],
      delete: async () => true,
    },
    fetch: async (input) => {
      const url = typeof input === "string" ? input : input.url;
      fetches.push(url);
      const path = new URL(url, "https://example.test/").pathname.replace(/^\//, "");
      if (failFetch.has(path)) throw new Error("network down");
      if (!server.has(path)) return new FakeResponse("not found", { status: 404 });
      return new FakeResponse("body:" + path);
    },
    importScripts: (url) => {
      const rel = String(url).split("?")[0];
      vm.runInContext(readFileSync(abs(rel), "utf8"), context);
    },
    postMessage: () => {},
  };
  sandbox.self = {
    // A real URL, not a stub: the worker reads .origin and .href from it.
    location: new URL("https://example.test/sw.js?v=" + manifest.hash),
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    skipWaiting: () => { sandbox.__skipped = true; },
    registration: {},
    clients: { matchAll: async () => [], claim: async () => {} },
    OFFLINE_MANIFEST: undefined,
  };
  sandbox.self.self = sandbox.self;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(readFileSync(abs("sw.js"), "utf8"), context);

  // Prime the cache with the entries the test wants already stored.
  const keyOf = (path) => {
    const entry = manifest.files.find((f) => f.path === path);
    return entry ? `https://example.test/${entry.path}?__rev=${entry.rev}` : null;
  };
  for (const p of cached) {
    const k = keyOf(p);
    if (k) store.set(k, new FakeResponse("cached:" + p));
  }

  return {
    listeners,
    store,
    fetches,
    keyOf,
    FakeResponse,
    respond: async (request) => {
      let out;
      const event = { request, respondWith: (p) => { out = p; } };
      for (const fn of listeners.fetch || []) fn(event);
      return out === undefined ? undefined : await out;
    },
    fire: async (type) => {
      const waits = [];
      const event = { waitUntil: (p) => waits.push(p) };
      for (const fn of listeners[type] || []) fn(event);
      await Promise.all(waits);
    },
  };
}

test("install precaches every manifest entry, and skips the ones already stored", async () => {
  const w = loadWorker({ server: new Set(manifest.files.map((f) => f.path)) });
  await w.fire("install");
  const precached = [...w.store.keys()];
  assert.equal(precached.length, manifest.files.length, "not every file was precached");

  // Every key is content-addressed, which is what makes staleness impossible.
  for (const f of manifest.files) {
    assert.ok(w.store.has(`https://example.test/${f.path}?__rev=${f.rev}`), `${f.path} was not keyed by its revision`);
  }

  // A second pass over an unchanged generation must not re-download anything.
  const first = w.fetches.length;
  const again = loadWorker({ cached: manifest.files.map((f) => f.path) });
  await again.fire("install");
  assert.equal(again.fetches.length, 0, "an unchanged generation re-downloaded files");
  assert.ok(first > 0);
});

test("one failing file degrades coverage instead of failing the whole install", async () => {
  const broken = manifest.files[0].path;
  const w = loadWorker({ server: new Set(manifest.files.map((f) => f.path)), failFetch: new Set([broken]) });
  await w.fire("install"); // must not reject
  assert.ok(!w.store.has(w.keyOf(broken)), "the failing file should not be cached");
  assert.ok(w.store.size > manifest.files.length - 5, "the install should otherwise have continued");
});

test("a device with no storage left still boots: install degrades, it does not reject", async () => {
  // QuotaExceededError from cache.put must be counted as a missing file, never
  // allowed to reject the install — a rejected install means no worker at all,
  // which would take away the online experience's only support structure.
  const w = loadWorker({ server: new Set(manifest.files.map((f) => f.path)), quotaExhausted: true });
  await w.fire("install");
  assert.equal(w.store.size, 0, "nothing should be cached when storage is exhausted");
  // The worker is still installed and answering requests.
  const res = await w.respond({ url: "https://example.test/" + manifest.files[0].path, method: "GET", mode: "no-cors" });
  assert.ok(res, "the online path must keep working when caching failed");
});

test("activate prunes anything the current generation does not list", async () => {
  const w = loadWorker({ cached: [manifest.files[0].path] });
  w.store.set("https://example.test/timeline.js?__rev=oldoldoldold", new w.FakeResponse("stale"));
  await w.fire("activate");
  assert.ok(!w.store.has("https://example.test/timeline.js?__rev=oldoldoldold"), "a stale revision survived activation");
  assert.ok(w.store.has(w.keyOf(manifest.files[0].path)), "the current generation was pruned by mistake");
});

test("a precached asset is served from cache even when the request says no-cache", async () => {
  // The app fetches deck JSON with cache:"no-cache" and audio with
  // cache:"force-cache". Forwarding either mode would break offline.
  const audio = manifest.files.find((f) => /\.mp3$/.test(f.path));
  const w = loadWorker({ cached: [audio.path] });
  const res = await w.respond({ url: "https://example.test/" + audio.path, method: "GET", mode: "no-cors", cache: "no-cache" });
  assert.equal(res.body, "cached:" + audio.path);
  assert.deepEqual(w.fetches, [], "a cached asset should not touch the network");

  const deckJson = "decks/index.json";
  const w2 = loadWorker({ cached: [deckJson] });
  const res2 = await w2.respond({ url: "https://example.test/" + deckJson, method: "GET", mode: "no-cors", cache: "no-cache" });
  assert.equal(res2.body, "cached:" + deckJson);
  assert.deepEqual(w2.fetches, []);
});

test("a bumped ?v=N is not served stale: a changed revision is a cache miss", async () => {
  // The browser still holds the OLD build under the old revision; the manifest
  // on disk describes the new one. Cache-first must not resurrect the old copy.
  const w = loadWorker({ server: new Set(["timeline.js"]) });
  w.store.set("https://example.test/timeline.js?__rev=aaaaaaaaaaaa", new w.FakeResponse("old build"));
  const res = await w.respond({ url: "https://example.test/timeline.js?v=200", method: "GET", mode: "no-cors" });
  assert.equal(res.body, "body:timeline.js", "the old revision was served for a new request");
});

test("requests the worker must not own are left alone", async () => {
  const w = loadWorker();
  // Cross-origin (NASA tiles): never intercepted, never cached.
  const cross = await w.respond({ url: "https://gibs.earthdata.nasa.gov/x/y/z.jpg", method: "GET", mode: "no-cors" });
  assert.equal(cross, undefined, "a cross-origin tile request must pass through untouched");
  // The freshness probe: network-only, so a new deployment is always visible.
  const probe = await w.respond({ url: "https://example.test/offline-manifest.json", method: "GET", mode: "cors" });
  assert.equal(probe, undefined, "the manifest probe must never be answered from cache");
  // Non-GET.
  const post = await w.respond({ url: "https://example.test/index.html", method: "POST" });
  assert.equal(post, undefined);
});

test("offline navigation falls back to the cached shell, then to an offline page", async () => {
  const w = loadWorker({ cached: ["index.html"], server: new Set() });
  const cachedShell = await w.respond({ url: "https://example.test/", method: "GET", mode: "navigate" });
  assert.equal(cachedShell.body, "cached:index.html", "an offline launch should boot the cached shell");

  const cold = loadWorker({ server: new Set() });
  const page = await cold.respond({ url: "https://example.test/", method: "GET", mode: "navigate" });
  assert.equal(page.status, 200);
  assert.match(page.body, /Offline/, "a first visit with no network must explain itself, not blank out");
  assert.ok(!/undefined/.test(page.body));
});

test("online navigation prefers the network, so a new deployment is picked up promptly", async () => {
  // A static host resolves "/" to index.html, so the fake server does too.
  const w = loadWorker({ cached: ["index.html"], server: new Set(["", "index.html"]) });
  const res = await w.respond({ url: "https://example.test/", method: "GET", mode: "navigate" });
  assert.notEqual(res.body, "cached:index.html", "the shell should come from the network when it is reachable");
  assert.ok(w.fetches.length >= 1, "the navigation should have hit the network");
});

test("over HTTP, every precached path is served — the offline list matches reality", async () => {
  // The strongest check available without a browser, and the one that matters
  // most: the precache list is only worth anything if a real static host
  // answers every URL in it. This serves the repo the way the site is
  // deployed (HTTP, root scope) rather than trusting the filesystem.
  const TYPES = {
    ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
    ".json": "application/json", ".webmanifest": "application/manifest+json",
    ".png": "image/png", ".mp3": "audio/mpeg", ".jpg": "image/jpeg",
  };
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (p === "/") p = "/index.html"; // a static host resolves the directory index
    const file = join(root, p);
    if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  try {
    const failed = [];
    for (const f of manifest.files) {
      const res = await fetch(base + f.path);
      if (!res.ok) failed.push(`${f.path} -> ${res.status}`);
    }
    assert.deepEqual(failed, [], "precached paths that a static host does not serve");

    const home = await fetch(base);
    assert.equal(home.status, 200);
    assert.match(home.headers.get("content-type") || "", /text\/html/);

    // Both of these must be reachable at root scope or the whole design fails:
    // the worker needs its own URL, and the page needs the freshness probe.
    assert.equal((await fetch(base + "sw.js")).status, 200);
    assert.equal((await fetch(base + "offline-manifest.js?v=" + manifest.hash)).status, 200);
    const probed = await (await fetch(base + "offline-manifest.json")).json();
    assert.equal(probed.hash, manifest.hash, "the probe the page trusts must describe the shipped list");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("an update is applied only when the page asks for it", async () => {
  const w = loadWorker();
  const messages = w.listeners.message || [];
  assert.equal(messages.length, 1, "the worker should listen for exactly one message type");
  messages[0]({ data: { type: "SKIP_WAITING" } });
  assert.equal(w.__skipped, undefined);
  assert.equal(w.listeners.install.length, 1);
  // The worker itself must never call skipWaiting during install: activating
  // mid-game is what would interrupt a player.
  // Read the code, not the prose: comments in this repo discuss skipWaiting.
  const src = readFileSync(abs("sw.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const installBody = src.slice(src.indexOf('"install"'), src.indexOf('"activate"'));
  assert.ok(!/skipWaiting/.test(installBody), "install must not skipWaiting on its own");
});
