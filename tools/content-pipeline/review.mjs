#!/usr/bin/env node
// review.mjs — generate a self-contained HTML review packet for a deck.
//
// No external resources, no JS — opens from file:// or a static host. Shows each
// event's prose, its source, its claims (with quote-support status), and the
// verifier's findings — the "review packet" from doc/CONTENT_PIPELINE.md.
//
// Usage: node review.mjs <deck.json> [--sources <dir>] [--out <path>]

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeck, loadSources } from "./lib/load.mjs";
import { loadRegistry } from "./lib/schema.mjs";
import { verifyDeck } from "./lib/verify.mjs";
import { summarize } from "./lib/findings.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "..", "..");

function die(msg) {
  console.error(`review: ${msg}`);
  process.exit(2);
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();

const argv = process.argv.slice(2);
let file = null;
let sourcesDir = null;
let out = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--sources") sourcesDir = argv[++i];
  else if (a === "--out") out = argv[++i];
  else if (a.startsWith("-")) die(`unknown option: ${a}`);
  else if (!file) file = a;
}
if (!file) die("usage: node review.mjs <deck.json> [--sources <dir>] [--out <path>]");

const deck = loadDeck(file);
if (!deck) die(`no deck found in ${file}`);
const registry = loadRegistry();
const sources = loadSources(sourcesDir);
const findings = verifyDeck(deck, { registry, sources });
const s = summarize(findings);
const PROSE = ["fact", "who", "where", "why", "summary", "story", "details"];
// The story's point of view is a declared narrative property, not decoration —
// the reviewer checks it matches the device (first = a voice, second = the reader).
const POV = { third: "third person (follows a character)", first: "first person (a voice \u2014 diary/letter)", second: "second person (addresses the reader)" };

function renderEvent(e) {
  const fs = findings.filter((f) => f.event === e.id);
  const srcText = sources[e.id] ? norm(sources[e.id]) : null;
  const claims = Array.isArray(e.claims) ? e.claims : [];

  const prose = PROSE.filter((k) => e[k])
    .map(
      (k) =>
        `<div class="field"><div class="k">${k}</div><div class="v">${esc(e[k])}</div></div>`,
    )
    .join("");

  const povLine = e.pointOfView ? `<div class="field"><div class="k">point of view</div><div class="v">${esc(POV[e.pointOfView] || e.pointOfView)}</div></div>` : "";
  const trace = Array.isArray(e.storyTrace) ? e.storyTrace : null;
  const docs = trace ? trace.filter((a) => Array.isArray(a) && a.length).length : 0;
  const traceLine = trace
    ? `<div class="field"><div class="k">story trace</div><div class="v">${docs} documented \u00b7 ${trace.length - docs} invented<br><small>${trace.map((a, i) => `${i + 1}: ${Array.isArray(a) && a.length ? a.join(",") : "invented"}`).join(" \u00b7 ")}</small></div></div>`
    : "";
  const source = e.source
    ? `<a href="${esc(e.source.url)}">${esc(e.source.name || e.source.url)}</a>
       <div class="meta">${esc(e.source.license)} · rev ${esc(e.source.revision || "?")}</div>
       ${e.source.attribution ? `<div class="meta">${esc(e.source.attribution)}</div>` : ""}`
    : `<em>none</em>`;

  const claimsTable = claims.length
    ? `<h3>Claims</h3><table><thead><tr><th>id</th><th>claim</th><th>supporting quote</th><th>in source</th></tr></thead><tbody>${claims
        .map((c) => {
          const supported = srcText !== null && c.quote ? srcText.includes(norm(c.quote)) : null;
          const badge = supported === null ? "—" : supported ? "✓" : "✗";
          return `<tr><td>${esc(c.id)}</td><td>${esc(c.text)}</td><td class="q">${esc(c.quote || "")}</td><td class="c ${supported === false ? "bad" : ""}">${badge}</td></tr>`;
        })
        .join("")}</tbody></table>`
    : "";

  const findingsList = fs.length
    ? `<h3>Findings</h3><ul class="findings">${fs
        .map(
          (x) =>
            `<li class="${x.severity}"><b>${esc(x.rule)}</b> ${esc(x.message)}${x.hint ? `<span class="hint"> ↳ ${esc(x.hint)}</span>` : ""}</li>`,
        )
        .join("")}</ul>`
    : `<p class="clean">No findings.</p>`;

  return `<section class="event">
    <h2>${esc(e.title)} <span class="id">${esc(e.id)}</span></h2>
    <div class="grid">
      <div class="col">${prose}</div>
      <div class="col">${povLine}${traceLine}<div class="field"><div class="k">source</div><div class="v">${source}</div></div></div>
    </div>
    ${claimsTable}
    ${findingsList}
  </section>`;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Review — ${esc(deck.name || deck.id)}</title>
<style>
  :root { color-scheme: light; }
  body { font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 24px; color: #1a1a1a; }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  .summary { color: #555; margin: 0 0 24px; }
  .event { border-top: 2px solid #e5e5e5; padding: 20px 0; }
  h2 { font-size: 1.1rem; margin: 0 0 12px; }
  .id { color: #888; font-weight: normal; font-size: 0.8rem; }
  h3 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: .04em; color: #666; margin: 16px 0 6px; }
  .grid { display: grid; grid-template-columns: 1fr 260px; gap: 20px; }
  @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
  .field { margin-bottom: 8px; }
  .k { font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: #888; }
  .v { white-space: pre-wrap; }
  .meta { color: #666; font-size: .85rem; }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; }
  th, td { text-align: left; vertical-align: top; padding: 6px 8px; border-bottom: 1px solid #eee; }
  td.q { color: #555; font-style: italic; }
  td.c { text-align: center; font-weight: 700; }
  td.c.bad { color: #b00020; }
  .findings { list-style: none; padding: 0; margin: 0; }
  .findings li { padding: 6px 10px; border-left: 3px solid #ccc; margin-bottom: 4px; background: #fafafa; }
  .findings li.error { border-color: #b00020; }
  .findings li.warning { border-color: #d08a00; }
  .hint { color: #777; font-size: .85rem; }
  .clean { color: #2a7a2a; }
  a { color: #0b5fff; }
</style>
</head>
<body>
<h1>Review packet — ${esc(deck.name || deck.id)}</h1>
<p class="summary">${s.errors} error(s) · ${s.warnings} warning(s) · ${(deck.events || []).length} event(s)</p>
${(deck.events || []).map(renderEvent).join("\n")}
</body>
</html>
`;

const outPath = out || join(REPO_ROOT, "content", "review", `${deck.id}.html`);
mkdirSync(dirname(resolve(outPath)), { recursive: true });
writeFileSync(resolve(outPath), html);
console.log(`wrote ${outPath} — ${s.errors} error(s), ${s.warnings} warning(s)`);
