#!/usr/bin/env node
/*
 * scripts/gen-offline-manifest.mjs
 * ------------------------------------------------------------------
 * Generates the offline precache manifest:
 *
 *   offline-manifest.json  — the source of truth (tooling + the page's probe)
 *   offline-manifest.js    — a classic-script mirror the SERVICE WORKER loads
 *                            via importScripts (workers have no modules here,
 *                            and this keeps the game's no-build rule intact)
 *
 * Why it is generated rather than hand-written: the list covers ~125 files and
 * 19 MB, and every entry carries a content revision. Workbox's own
 * documentation is blunt about the alternative — "never hardcode revision info
 * into a hand written manifest, as precached URLs will not be kept up to date
 * unless the revision info reflects the URL's contents". A hand-typed revision
 * is the ?v=N mistake again, and it is exactly how a re-rendered narration clip
 * (same path, new audio) would go on being served stale to every offline
 * player. So the revision is measured here, from the bytes on disk.
 *
 * The content hash of the whole list is what versions the service worker:
 * the page registers `sw.js?v=<hash>`, so a changed asset set is a changed
 * script URL and the browser runs its normal update lifecycle.
 *
 * Scope is an ALLOW-LIST, never a directory sweep: doc/, tools/, content/,
 * scripts/, .env*, *.md and the worker itself are never precached (they are
 * not shipped to a player, and a sweep would start caching them the moment
 * someone added a file). The deny check below fails loudly if that ever
 * regresses.
 *
 * Run:
 *   node scripts/gen-offline-manifest.mjs          # write both files
 *   node scripts/gen-offline-manifest.mjs --check  # exit 1 if stale (gate)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const jsonPath = join(root, "offline-manifest.json");
const jsPath = join(root, "offline-manifest.js");
const check = process.argv.includes("--check");

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
const rel = (full) => relative(root, full).split(sep).join("/");

/* ---------- the shipped set (allow-list) ---------- */
const SHELL = [
  "index.html",
  "manifest.webmanifest",
  "offline.js",
  "styles.css",
  "events-data.js",
  "decks-io.js",
  "fx.js",
  "globe.js",
  "narration-recipe.js",
  "narration.js",
  "review-scheduler.js",
  "connections.js",
  "timeline.js",
];
const DIRS = [
  "assets/vendor",
  "assets/leaflet",
  "assets/images",
  "assets/cursors",
  "assets/audio",
  "icons",
];
const FILES = [
  "assets/world-land.js",
  "assets/earth-textures.js",
  "decks/index.js",
  "decks/index.json",
];
const AUDIO_DIRS = ["assets/audio"];

/** Every path a player's browser actually asks for, and nothing else. */
function collect() {
  const out = new Set(SHELL);
  for (const f of FILES) out.add(f);
  for (const dir of DIRS) {
    const full = join(root, dir);
    if (!existsSync(full)) fail(`${dir}/ is missing`);
    for (const name of readdirSync(full)) {
      if (name.startsWith(".")) continue;
      const p = join(full, name);
      if (!statSync(p).isFile()) continue;
      // Audio directories ship assets only; the matching LICENSE.txt is not
      // requested by the game and is not precached.
      if (dir === "assets/audio" && !name.endsWith(".mp3")) continue;
      if (dir === "icons" && !name.endsWith(".png")) continue;
      out.add(rel(p));
    }
  }
  // Deck packages: the generated classic-script mirror of each deck, plus the
  // narration clips that belong to it.
  const decksDir = join(root, "decks");
  for (const name of readdirSync(decksDir)) {
    if (name.startsWith(".")) continue;
    const pkg = join(decksDir, name);
    if (!statSync(pkg).isDirectory()) continue;
    const script = join(pkg, "deck.js");
    if (existsSync(script)) out.add(rel(script));
    const narration = join(pkg, "narration");
    if (existsSync(narration)) {
      for (const clip of readdirSync(narration)) {
        if (clip.endsWith(".mp3")) out.add(rel(join(narration, clip)));
      }
    }
  }
  return [...out].sort();
}

/* Never precache anything that is not part of the player-facing build. This is
   a belt-and-braces check on the allow-list above: if a future edit widens a
   directory, the gate fails instead of quietly shipping repo files to players. */
const DENY = [
  /^doc\//, /^tools\//, /^content\//, /^scripts\//, /^node_modules\//, /^\./,
  /\.md$/, /\.mjs$/, /\.json$/, /lock/i,
  /^package\.json$/, /^sw\.js$/, /^offline-manifest\./,
];
const ALLOW_JSON = new Set(["offline-manifest.json", "manifest.webmanifest", "decks/index.json"]);
for (const p of collect()) {
  if (ALLOW_JSON.has(p)) continue;
  const bad = DENY.find((re) => re.test(p));
  if (bad) fail(`refusing to precache "${p}" — it matches ${bad} (repo-only or dev-only file)`);
}

/* ---------- entries ---------- */
const paths = collect();
const files = paths.map((p) => {
  const full = join(root, p);
  if (!existsSync(full)) fail(`precache path does not exist: ${p}`);
  const buf = readFileSync(full);
  return { path: p, rev: createHash("sha256").update(buf).digest("hex").slice(0, 12), bytes: buf.length };
});
const totalBytes = files.reduce((n, f) => n + f.bytes, 0);

// The generation hash covers the path+revision of every entry, so it changes
// exactly when the shipped bytes change — including a clip re-rendered at an
// unchanged path (its revision moves, so the hash moves).
const hash = createHash("sha256");
for (const f of files) hash.update(f.path + "\0" + f.rev + "\n");
const generation = hash.digest("hex").slice(0, 12);

const manifest = {
  formatVersion: 1,
  hash: generation,
  generatedBy: "scripts/gen-offline-manifest.mjs",
  // The page and the worker must agree on this, so it is recorded once here
  // rather than written as a literal in both files (which would drift).
  cacheName: "timeline-offline",
  totalBytes,
  files,
};

const nextJson = JSON.stringify(manifest, null, 2) + "\n";
const nextJs =
  "/* GENERATED by scripts/gen-offline-manifest.mjs — do not edit by hand.\n" +
  " * The service worker loads this with importScripts() at install time. */\n" +
  "self.OFFLINE_MANIFEST = " +
  JSON.stringify(manifest, null, 2) +
  ";\n";

const MB = (totalBytes / (1024 * 1024)).toFixed(1);

if (check) {
  const curJson = existsSync(jsonPath) ? readFileSync(jsonPath, "utf8") : "";
  const curJs = existsSync(jsPath) ? readFileSync(jsPath, "utf8") : "";
  if (curJson !== nextJson || curJs !== nextJs) {
    console.error(
      "✗ offline-manifest.json / offline-manifest.js are out of date — run: node scripts/gen-offline-manifest.mjs"
    );
    process.exit(1);
  }
  console.log(
    `✓ offline-manifest.{json,js} up to date (${files.length} files, ${MB} MB, generation ${generation}).`
  );
  process.exit(0);
}

writeFileSync(jsonPath, nextJson);
writeFileSync(jsPath, nextJs);
console.log(
  `✓ Wrote offline-manifest.{json,js} (${files.length} files, ${MB} MB, generation ${generation}).`
);
