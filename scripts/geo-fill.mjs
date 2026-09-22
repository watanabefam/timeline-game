import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lookupWhere } from "./gazetteer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function resolveDeckPath(entry) {
  return entry.layout === "folder"
    ? join(ROOT, "decks", entry.dir, entry.entry || "deck.json")
    : join(ROOT, "decks", entry.file);
}

function normaliseEntry(entry) {
  if (typeof entry === "string") return { layout: "file", file: entry };
  if (entry && entry.layout) return entry;
  if (entry && entry.file) return { ...entry, layout: "file" };
  if (entry && entry.dir) return { ...entry, layout: "folder" };
  return entry || {};
}

// New generated decks/index.json, falling back to the old decks/manifest.json
// and finally to scanning decks/*.js — so this never hard-fails mid-migration.
function loadDeckIndex() {
  for (const name of ["index.json", "manifest.json"]) {
    const path = join(ROOT, "decks", name);
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      const decks = Array.isArray(parsed) ? parsed : parsed.decks || [];
      return decks.map(normaliseEntry);
    } catch {
      /* try the next source */
    }
  }
  return readdirSync(join(ROOT, "decks"))
    .filter((f) => f.endsWith(".js") && f !== "manifest.js")
    .sort()
    .map((file) => ({ layout: "file", file }));
}

function processFile(filePath) {
  const full = join(ROOT, filePath);
  const text = readFileSync(full, "utf8");
  const lines = text.split("\n");

  const out = lines.map((line) => {
    if (line.includes("where:") && line.includes("id:")) {
      const m = line.match(/where:\s*"([^"]*)"/);
      if (!m) return line;
      const g = lookupWhere(m[1]);
      if (!g) return line;
      let add = `, lat: ${g.lat}, lng: ${g.lng}`;
      if (g.area !== undefined) add += `, area: ${JSON.stringify(g.area)}`;
      if (g.off) add = `, noMap: true`;
      return stripGeo(line).replace(/ },\s*$/, `${add} },`);
    }
    return line;
  });

  writeFileSync(full, out.join("\n"));
  console.log("geo-fill: wrote", filePath);
}

function stripGeo(line) {
  return line
    .replace(/,\s*lat:\s*-?\d+(?:\.\d+)?/g, "")
    .replace(/,\s*lng:\s*-?\d+(?:\.\d+)?/g, "")
    .replace(/,\s*area:\s*(?:"world"|\d+(?:\.\d+)?)/g, "")
    .replace(/,\s*noMap:\s*true/g, "");
}

// Folder decks are JSON: apply the same gazetteer lookup to any node that has
// both `id` and `where`, then re-serialise pretty (2-space, trailing newline).
function fillGeo(node) {
  if (Array.isArray(node)) {
    for (const item of node) fillGeo(item);
    return;
  }
  if (!node || typeof node !== "object") return;
  if (typeof node.where === "string" && node.id !== undefined) {
    const g = lookupWhere(node.where);
    if (g) {
      delete node.lat;
      delete node.lng;
      delete node.area;
      delete node.noMap;
      if (g.off) {
        node.noMap = true;
      } else {
        node.lat = g.lat;
        node.lng = g.lng;
        if (g.area !== undefined) node.area = g.area;
      }
    }
  }
  for (const key of Object.keys(node)) fillGeo(node[key]);
}

function processJsonFile(full) {
  const data = JSON.parse(readFileSync(full, "utf8"));
  fillGeo(data);
  writeFileSync(full, JSON.stringify(data, null, 2) + "\n");
  console.log("geo-fill: wrote", full.slice(ROOT.length + 1));
}

processFile("events-data.js");

for (const entry of loadDeckIndex()) {
  if (entry.layout === "folder") {
    processJsonFile(resolveDeckPath(entry));
  } else {
    processFile(join("decks", entry.file));
  }
}
