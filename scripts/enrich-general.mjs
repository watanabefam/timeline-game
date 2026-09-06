/*
 * scripts/enrich-general.mjs
 * ------------------------------------------------------------------
 * Adds structured who/where/why fields to the GENERAL_DECK events
 * (their `fact` strings already add value, so those are kept). Mirrors
 * enrich-cc.mjs so both decks feed the same fact-sheet UI.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = join(here, "..", "events-data.js");
let text = readFileSync(srcPath, "utf8");

const VALUE_RE = /(?:"(?:[^"\\]|\\.)*"|-?\d+|true|false|null)/;
function field(s, key) {
  const m = s.match(new RegExp(key + ":\\s*(" + VALUE_RE.source + ")"));
  return m ? m[1] : undefined;
}

// id -> { who, where, why }  (fact kept from file)
const GENERAL = {
  "printing-press": { who: "Johannes Gutenberg", where: "Germany", why: "Made books cheap; spread ideas and the Reformation." },
  telescope: { who: "Galileo Galilei", where: "Italy", why: "Turned the spyglass skyward; saw Jupiter's moons." },
  vaccine: { who: "Edward Jenner", where: "England", why: "Began the end of smallpox, a plague older than history." },
  penicillin: { who: "Alexander Fleming", where: "England (London)", why: "The first antibiotic; transformed medicine." },
  dna: { who: "Watson, Crick, Franklin", where: "England", why: "The double helix unlocked modern genetics." },
  moon: { who: "Armstrong & Aldrin (Apollo 11)", where: "The Moon", why: "About 600M watched live; a peak of 20th-century achievement." },
  "steam-train": { who: "Stockton & Darlington Railway", where: "England", why: "First public steam-hauled railway; sped up travel." },
  telephone: { who: "Alexander Graham Bell", where: "USA / Canada", why: "First practical phone; 'Mr. Watson, come here.'" },
  lightbulb: { who: "Thomas Edison", where: "USA", why: "Long-lasting bulb beat the dark; tested thousands of filaments." },
  radio: { who: "Guglielmo Marconi", where: "Atlantic", why: "First transatlantic signal ('S') in 1901." },
  tv: { who: "BBC", where: "England", why: "First regular TV broadcasts (1936)." },
  transistor: { who: "Bell Labs", where: "USA", why: "Tiny switch that launched the microchip age." },
  internet: { who: "ARPANET", where: "USA", why: "First ARPANET message (1969) crashed after 'LO'." },
  www: { who: "Tim Berners-Lee", where: "CERN, Switzerland", why: "Proposed the Web in 1989." },
  "magna-carta": { who: "King John; English barons", where: "England", why: "A seed of constitutional liberty and the rule of law." },
  columbus: { who: "Christopher Columbus", where: "The Caribbean", why: "Reached the Americas in 1492 seeking Asia." },
  "french-rev": { who: "French citizens", where: "France", why: "Storming the Bastille (1789) symbolized revolution." },
  "us-civil-war": { who: "Union vs. Confederacy", where: "USA", why: "Deadliest US war; ended slavery." },
  ww1: { who: "Allied vs. Central Powers", where: "Europe / world", why: "Began 1914 after an assassination in Sarajevo." },
  ww2: { who: "Allied vs. Axis", where: "Worldwide", why: "Ended 1945; touched nearly every corner of the globe." },
  "fall-berlin": { who: "East & West Berliners", where: "Germany", why: "1989; crowds chipped at the wall that night." },
  shakespeare: { who: "William Shakespeare", where: "England", why: "Wrote about 38 plays; a cornerstone of literature." },
  beethoven: { who: "Ludwig van Beethoven", where: "Austria", why: "Deaf by his 9th premiere; a turning point in music." },
  photography: { who: "Joseph Niépce", where: "France", why: "The first image that survived, launching photography." },
  jazz: { who: "Early jazz pioneers", where: "USA (New Orleans)", why: "First jazz records (1917) by a white band; originators overlooked." },
  beatles: { who: "The Beatles", where: "England", why: "Launched the most influential band of the rock era." },
  "star-wars": { who: "George Lucas", where: "USA", why: "Set the template for the modern franchise blockbuster." },
  smartphone: { who: "Apple (iPhone)", where: "USA", why: "Redefined what a phone was and launched the app economy." },
  pyramids: { who: "Pharaoh Khufu's builders", where: "Giza, Egypt", why: "Tallest human structure for roughly 3,800 years." },
  homer: { who: "Homer", where: "Greece", why: "Composed orally; written down centuries later." },
  "rome-founded": { who: "Romulus (legend)", where: "Italy", why: "Legendary founding of Rome." },
  alexander: { who: "Alexander the Great", where: "Macedon / Greece", why: "Conquered an empire by 32; died at 32." },
  aqueduct: { who: "Romans", where: "Rome / empire", why: "Gravity alone moved water for miles without a pump." },
};

const BASE_KEYS = ["id", "title", "year", "circa", "category", "continent", "week", "sortYear", "emoji"];
const lines = text.split("\n");
let updated = 0;
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/id:\s*"([\w-]+)"/);
  if (!m || !GENERAL[m[1]]) continue;
  const e = GENERAL[m[1]];
  const base = BASE_KEYS.filter((k) => field(lines[i], k) !== undefined)
    .map((k) => `${k}: ${field(lines[i], k)}`)
    .join(", ");
  const fact = field(lines[i], "fact");
  const em = field(lines[i], "emoji") || '"📌"';
  const extra =
    (e.who ? `, who: ${JSON.stringify(e.who)}` : "") +
    (e.where ? `, where: ${JSON.stringify(e.where)}` : "") +
    (e.why ? `, why: ${JSON.stringify(e.why)}` : "");
  lines[i] = `    { ${base}, fact: ${fact}${extra}, emoji: ${em} },`;
  updated++;
}

writeFileSync(srcPath, lines.join("\n"));
console.log(`Added who/where/why to ${updated} GENERAL events.`);
