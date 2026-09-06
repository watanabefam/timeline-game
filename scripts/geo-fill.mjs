import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lookupWhere } from "./gazetteer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

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

processFile("events-data.js");

const manifest = JSON.parse(
  readFileSync(join(ROOT, "decks", "manifest.json"), "utf8"),
);
for (const file of manifest) {
  processFile(join("decks", file));
}
