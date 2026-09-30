#!/usr/bin/env node
/*
 * scripts/gen-narration-recipe.mjs
 * ------------------------------------------------------------------
 * Generates narration-recipe.js — the browser's copy of the spoken-text
 * recipe — from the region marked `mirror:begin`/`mirror:end` inside
 * tools/narration/text.mjs.
 *
 * Why a generated copy: the recipe must be identical in two places that
 * cannot share code. The authoring tool and the content gate run in
 * Node and import text.mjs directly; the player is a classic-script
 * page with no bundler and no module loader, so it needs a plain
 * `window.NarrationText`. Hand-copying it is how the two drift apart —
 * which is exactly how the v1 regex ended up speaking "Built in by the
 * Nile" and leaving "1,789" in the audio.
 *
 * The region is validated before emission: anything Node-only in it
 * (`import`, `require`, `node:`) is a hard error, because it would break
 * in a browser. The recipe id and a hash of the copied source go into
 * the banner, so a stale mirror is obvious in a diff.
 *
 * Run:
 *   node scripts/gen-narration-recipe.mjs          # write narration-recipe.js
 *   node scripts/gen-narration-recipe.mjs --check  # exit 1 if stale (CI gate)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const SOURCE = join(repoRoot, "tools", "narration", "text.mjs");
const TARGET = join(repoRoot, "narration-recipe.js");
const check = process.argv.includes("--check");

/** Names the browser needs, discovered from the region's own exports. */
const EXPOSE = ["RECIPE", "stripYearSpans", "yearLeaks", "spokenText", "applyLexicon"];

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const source = readFileSync(SOURCE, "utf8");
const begin = source.indexOf("/* === mirror:begin");
const end = source.indexOf("/* === mirror:end");
if (begin < 0 || end < 0 || end < begin) {
  fail("tools/narration/text.mjs: mirror:begin / mirror:end markers are missing or out of order");
}

const region = source
  .slice(source.indexOf("\n", begin) + 1, end)
  .replace(/^export /gm, "")
  .trimEnd();

for (const [pattern, why] of [
  [/^\s*import\b/m, "an import statement"],
  [/\brequire\s*\(/, "a require() call"],
  [/\bnode:/, "a node: import"],
  [/\bcreateHash\b/, "node:crypto"],
]) {
  if (pattern.test(region)) {
    fail(`the mirror region contains ${why}, which cannot run in a browser — move it below the marker`);
  }
}

const missing = EXPOSE.filter(
  (name) => !new RegExp(`^(?:const|function|class)\\s+${name}\\b`, "m").test(region)
);
if (missing.length) fail(`the mirror region does not define: ${missing.join(", ")}`);

const recipe = (region.match(/^const RECIPE = "([^"]+)"/m) || [])[1] || "unknown";
const digest = createHash("sha256").update(region).digest("hex").slice(0, 12);

const generated = `/* narration-recipe.js — GENERATED FILE, DO NOT EDIT.
 *
 * The browser's copy of the spoken-text recipe: it removes anything that
 * would give the answer away from the words read aloud (years, decades,
 * date ranges, centuries), then repairs the sentence left behind.
 *
 * Source of truth: tools/narration/text.mjs, between the mirror markers.
 * Recipe: ${recipe} · source hash: ${digest}
 * Regenerate: npm run gen:recipe   ·   Verify: npm run validate:recipe
 *
 * narration.js must stay the only consumer; load this before it.
 */
(function () {
  "use strict";

${region
  .split("\n")
  .map((line) => (line ? `  ${line}` : ""))
  .join("\n")}

  window.NarrationText = {
    recipe: RECIPE,
    sourceHash: "${digest}",
${EXPOSE.map((name) => `    ${name}: ${name},`).join("\n")}
  };
})();
`;

if (check) {
  const current = existsSync(TARGET) ? readFileSync(TARGET, "utf8") : "";
  if (current !== generated) {
    fail(
      `narration-recipe.js is stale (expected source hash ${digest}).\n` +
        `  Run: npm run gen:recipe`
    );
  }
  console.log(`✓ narration-recipe.js is current (recipe ${recipe}, hash ${digest})`);
  process.exit(0);
}

writeFileSync(TARGET, generated);
console.log(`✓ narration-recipe.js written (recipe ${recipe}, hash ${digest}, ${generated.length} bytes)`);
