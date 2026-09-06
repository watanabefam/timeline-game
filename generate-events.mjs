#!/usr/bin/env node
/*
 * generate-events.mjs
 * ------------------------------------------------------------------
 * Uses a cheap LLM (default: DeepSeek V3 via the OpenAI-compatible
 * endpoint) to propose NEW timeline events in the WHEN?/Timdle data
 * shape, so you can grow the library without hand-writing facts.
 *
 * Costs: DeepSeek V3 is ~$0.27 / 1M input and ~$1.10 / 1M output
 * (mid-2026 rates). A single 10-event batch is a few hundred tokens,
 * so each run is a fraction of a cent.
 *
 * Setup:
 *   npm init -y
 *   npm i openai dotenv
 *   cp .env.example .env      # then paste your DeepSeek key
 *   node generate-events.mjs
 *
 * Or use any OpenAI-compatible endpoint by editing BASE_URL / MODEL.
 */
import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- config (cheap defaults) ----------------------------------
const API_KEY = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
const BASE_URL = process.env.BASE_URL || "https://api.deepseek.com/v1";
const MODEL = process.env.MODEL || "deepseek-chat"; // DeepSeek V3
const COUNT = Number(process.env.COUNT || 10);

if (!API_KEY) {
  console.error("Missing API key. Set DEEPSEEK_API_KEY in .env (see .env.example).");
  process.exit(1);
}

const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });

const EMOJIS = ["📜", "🔭", "💡", "🚀", "🎭", "⚔️", "🌐", "🧬", "🏛️", "📻", "🎺", "🖨️", "⛵", "🦠", "💉"];
const CATEGORIES = ["tech", "culture", "discovery", "world"];
const COLORS = ["coral", "sun", "mint", "sky", "lilac"];

const SYSTEM = `You are a meticulous history editor. Propose factual, verifiable historical events suitable for a timeline-ordering game.
Each event must be: a single real occurrence with a known (or well-estimated) year, interesting to a general audience, and free of opinion.
Prefer variety across categories and eras.

CRITICAL CONTENT RULE — the "fact" must ADD information the title does NOT already give:
  - The fact must NOT repeat the title, and must NOT merely reword it.
  - The fact must introduce a concrete new detail: a name, a place, a number/year,
    or a causal/significance word ("because", "invented", "led to", "founded", …).
  - Also fill the structured fields used by the in-game fact sheet:
      "who"   : the key person/people or group (string, may be empty)
      "where" : the place/region (string, may be empty)
      "why"   : one sentence on why it matters / what to remember (string, may be empty)

Output ONLY valid JSON: an array of ${COUNT} objects with exactly these keys:
{ "title": string (neutral, ~8-12 words, no year in the text),
  "year": integer (negative for BCE),
  "category": one of ${JSON.stringify(CATEGORIES)},
  "emoji": one of ${JSON.stringify(EMOJIS)},
  "color": one of ${JSON.stringify(COLORS)},
  "fact": string (one engaging sentence revealed AFTER the player places it; must add a detail beyond the title),
  "who": string,
  "where": string,
  "why": string,
  "circa": boolean (true only if the year is approximate, e.g. ancient events) }

Example:
  title: "Movable-type printing press demonstrated in Europe"
  fact:  "Gutenberg's press made books cheap enough to spread ideas across a continent."
  who:   "Johannes Gutenberg"
  where: "Germany"
  why:   "Made books cheap; spread ideas and the Reformation."`;

function attemptArray(toolArgs) {
  try {
    const obj = JSON.parse(toolArgs);
    if (Array.isArray(obj)) return obj;
    if (Array.isArray(obj.events)) return obj.events;
  } catch {}
  return null;
}

async function main() {
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Generate ${COUNT} events. Return only the JSON array.` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.9,
  });

  const raw = completion.choices[0].message.content || "{}";
  let events = attemptArray(raw);
  if (!events) {
    // sometimes the model wraps or adds prose; try to extract an array
    const m = raw.match(/\[[\s\S]*\]/);
    if (m) events = attemptArray(m[0]);
  }
  if (!events) {
    console.error("Could not parse model output:\n" + raw);
    process.exit(1);
  }

  // basic validation / normalization
  const cleaned = events.map((e, i) => ({
    id: "ai-" + Date.now().toString(36) + "-" + i,
    title: String(e.title || "").slice(0, 200),
    year: Number(e.year) || 0,
    category: CATEGORIES.includes(e.category) ? e.category : "world",
    emoji: typeof e.emoji === "string" ? e.emoji : "📌",
    color: COLORS.includes(e.color) ? e.color : "sky",
    fact: String(e.fact || "").slice(0, 300),
    who: typeof e.who === "string" ? e.who.slice(0, 120) : "",
    where: typeof e.where === "string" ? e.where.slice(0, 120) : "",
    why: typeof e.why === "string" ? e.why.slice(0, 200) : "",
    circa: Boolean(e.circa),
  }));

  const outPath = path.join(__dirname, "generated-events.json");
  fs.writeFileSync(outPath, JSON.stringify(cleaned, null, 2));
  console.log(`Wrote ${cleaned.length} events to ${outPath}`);
  console.log("Review, then merge into events-data.js (or load generated-events.json).");
  console.log("Run `node scripts/validate-content.mjs` to confirm the fact-quality rule passes.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
