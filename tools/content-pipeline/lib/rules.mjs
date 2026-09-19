import { paragraphs, sentences } from "./text.mjs";
// rules.mjs — content-quality rules. Pure functions, no I/O, no LLM.
// Severities: GROUNDING / LAYER_REDUNDANCY / YEAR_LEAK / READABILITY_BAND are
// review-triage *warnings* (heuristics); structure + licensing are hard gates.

import { finding } from "./findings.mjs";

const STOP = new Set(
  "the a an and or of to in on for with by at from into over under is was were be been being as that this these those it its their his her our your my we they he she you i them us than then so but not no do did does if which who when where how can will would have has had".split(
    " ",
  ),
);

// ---- YEAR_LEAK ------------------------------------------------------------
// 4-digit years (1000–2099) and explicitly era-marked years. Deliberately avoids
// matching quantities like "600 million" or "3,800 years".
const YEAR_RE = /\b(?:1\d{3}|20\d{2})\b|\b\d{1,4}\s?(?:BCE|BC|CE|AD)\b/g;

export function checkYearLeak(e) {
  const out = [];
  for (const field of ["fact", "why"]) {
    const v = e[field];
    if (typeof v !== "string") continue;
    const hits = [...new Set(v.match(YEAR_RE) || [])];
    if (hits.length) {
      out.push(
        finding("YEAR_LEAK", "warning", `year in ${field}: ${hits.join(", ")}`, {
          event: e.id,
          path: field,
        }),
      );
    }
  }
  return out;
}

// ---- LAYER_REDUNDANCY -----------------------------------------------------
// Cross-field restatement, judged at the *claim* level via content-token
// overlap (Jaccard) — shared entities are fine; repeated claims are not.
function contentTokens(text) {
  return new Set(
    (text || "")
      .toLowerCase()
      .replace(/(\d),(\d)/g, "$1$2")
      // Unicode-aware: keep accented/non-ASCII letters (names, transliterations) rather
      // than stripping them to nothing.
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t && !STOP.has(t)),
  );
}

function jaccard(a, b) {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}

const LAYERS = ["fact", "why", "summary", "story", "details"];

export function checkRedundancy(e, { threshold = 0.6, minTokens = 4 } = {}) {
  const fields = LAYERS.filter((f) => typeof e[f] === "string" && e[f].trim());
  const out = [];
  for (let i = 0; i < fields.length; i++) {
    for (let j = i + 1; j < fields.length; j++) {
      const a = contentTokens(e[fields[i]]);
      const b = contentTokens(e[fields[j]]);
      if (a.size < minTokens || b.size < minTokens) continue;
      const overlap = jaccard(a, b);
      if (overlap >= threshold) {
        out.push(
          finding(
            "LAYER_REDUNDANCY",
            "warning",
            `${fields[i]} and ${fields[j]} restate each other (overlap ${overlap.toFixed(2)})`,
            { event: e.id, path: `${fields[i]}/${fields[j]}`, overlap: Number(overlap.toFixed(2)) },
          ),
        );
      }
    }
  }
  return out;
}

// ---- GROUNDING ------------------------------------------------------------
// Proper nouns in prose should appear in the frozen source. Sentence-initial
// capitalisation is skipped to avoid flagging ordinary sentence starts.
function properNouns(text) {
  const names = new Set();
  for (const sentence of (text || "").split(/(?<=[.!?])\s+/)) {
    const toks = sentence.split(/\s+/);
    toks.forEach((tok, i) => {
      if (i === 0) return; // sentence-initial capital is not evidence
      // Strip surrounding punctuation and a possessive suffix, so "Merer's"
      // checks as the entity "Merer" the source actually names.
      const t = tok
        .replace(/[^A-Za-z'-]/g, "")
        .replace(/^['-]+|['-]+$/g, "")
        .replace(/'s$/, "");
      if (t.length < 3) return;
      if (t[0] !== t[0].toUpperCase() || t === t.toUpperCase()) return;
      if (STOP.has(t.toLowerCase())) return;
      names.add(t);
    });
  }
  return [...names];
}

export function checkGrounding(e, sourceText) {
  if (!sourceText) return [];
  const hay = sourceText.toLowerCase();
  // Names the event declares as invented (a composite cast) are not grounding
  // failures — they are disclosed inventions, checked by the storyNote instead.
  const declared = new Set(
    (Array.isArray(e.characters) ? e.characters : []).map((n) => String(n).toLowerCase()),
  );
  const out = [];
  for (const field of ["fact", "who", "where", "why", "summary", "story", "details"]) {
    const v = e[field];
    if (typeof v !== "string" || !v.trim()) continue;
    const missing = properNouns(v).filter(
      (n) => !hay.includes(n.toLowerCase()) && !declared.has(n.toLowerCase()),
    );
    if (missing.length) {
      out.push(
        finding("GROUNDING", "warning", `${field} names not in source: ${missing.join(", ")}`, {
          event: e.id,
          path: field,
        }),
      );
    }
  }
  return out;
}

// ---- READABILITY_BAND -----------------------------------------------------
function syllables(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const m = w.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}

/** Flesch–Kincaid grade level (approximate; standard formula). */
export function fleschKincaidGrade(text) {
  const sentences = Math.max(1, (text.match(/[.!?]+/g) || []).length);
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = Math.max(1, words.length);
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  return 0.39 * (wordCount / sentences) + 11.8 * (syl / wordCount) - 15.59;
}

// `summary` only, by design. `details` is DELIBERATELY ungraded (decided 2026-09-14):
// it is the reference layer, meant to be denser, and owes adult accessibility rather
// than an age band. `story` has its own band below. See doc/CONTENT_PIPELINE.md.
export function checkReadability(e, { min = 3, max = 9 } = {}) {
  const text = e.summary;
  if (typeof text !== "string" || !text.trim()) return [];
  const grade = fleschKincaidGrade(text);
  if (grade < min || grade > max) {
    return [
      finding(
        "READABILITY_BAND",
        "warning",
        `summary grade ${grade.toFixed(1)} outside ${min}–${max}`,
        { event: e.id, path: "summary", grade: Number(grade.toFixed(1)) },
      ),
    ];
  }
  return [];
}

// ---- CLAIMS (draft contract) ---------------------------------------------
// "No supporting span → no value": every claim must carry a quote that appears
// verbatim in the frozen source. A quote absent from the source (or missing
// entirely) is a fabrication risk and blocks the draft.
function normalize(s) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function checkClaims(e, sourceText) {
  if (!Array.isArray(e.claims) || !e.claims.length) return [];
  const out = [];
  const hay = normalize(sourceText);

  // Shape first: a duplicate id silently overwrites in the trace; an empty claim
  // asserts nothing while looking like evidence.
  const seen = new Set();
  for (const c of e.claims) {
    const id = c && c.id ? c.id : "?";
    if (c && c.id) {
      if (seen.has(c.id)) out.push(finding("CLAIM_SHAPE", "error", `duplicate claim id ${c.id}`, { event: e.id, path: `claims.${c.id}` }));
      seen.add(c.id);
    }
    if (!c || !c.text || !String(c.text).trim()) {
      out.push(finding("CLAIM_SHAPE", "error", `claim ${id} has no text`, { event: e.id, path: `claims.${id}` }));
    }
  }

  for (const c of e.claims) {
    const path = `claims.${c && c.id ? c.id : "?"}`;
    if (!c || !c.quote || !c.quote.trim()) {
      out.push(
        finding("CLAIM_NO_QUOTE", "error", `claim ${c && c.id} has no supporting quote`, {
          event: e.id,
          path,
        }),
      );
    } else if (sourceText && !hay.includes(normalize(c.quote))) {
      out.push(
        finding("CLAIM_UNSUPPORTED", "error", `claim ${c.id} quote not found in source`, {
          event: e.id,
          path,
        }),
      );
    }
  }
  return out;
}

// ---- STORY_SOURCE ---------------------------------------------------------
// A story must declare how it relates to its sources (doc §3) so the UI can
// disclose it. Without it a story ships unlabelled — and an invented one reads
// as fact. Grounded in children's-publishing usage ("retold by…" / "adapted
// by…") plus IFLA FRBR/LRM derivation terms.
const STORY_SOURCES = new Set([
  "retold",
  "adapted",
  "abridged",
  "paraphrased",
  "summarised",
  "translated",
  "quoted",
  "invented",
  "original",
]);

export function checkStorySource(e) {
  if (!e.story) return [];
  if (STORY_SOURCES.has(e.storySource)) return [];
  const got = e.storySource ? ` (got "${e.storySource}")` : "";
  return [
    finding(
      "STORY_SOURCE_MISSING",
      "error",
      `story has no declared source relationship${got} — use retold | adapted | abridged | ` +
        `paraphrased | summarised | translated | quoted | invented | original`,
      { event: e.id, path: "storySource" },
    ),
  ];
}

// ---- SOURCES --------------------------------------------------------------
// `usedFor` is the "Used for" column: a source with no stated purpose can't be
// shown to the reader as evidence for anything.
export function checkSources(e) {
  const rows = Array.isArray(e.sources) ? e.sources : [];
  const out = [];
  rows.forEach((s, i) => {
    if (!s || !s.usedFor || !String(s.usedFor).trim()) {
      const what = (s && (s.title || s.url || s.name)) || `#${i}`;
      out.push(
        finding("SOURCE_USEDFOR_MISSING", "error", `source "${what}" does not say what it was used for`, {
          event: e.id,
          path: `sources[${i}].usedFor`,
        }),
      );
    }
  });
  return out;
}

// ---- CHANGED --------------------------------------------------------------
// CC requires licensees to "indicate if changes were made"; describing WHAT was
// changed is the encouraged practice (and what the OER guides do as standard).
// Only the indication is a licence condition — so this warns, it does not block.
export function checkChanged(e) {
  if (!e.story) return [];
  if (e.storySource === "original") return []; // our own writing — nothing adapted
  const rows = Array.isArray(e.sources) && e.sources.length ? e.sources : e.source ? [e.source] : [];
  if (!rows.length) return [];
  if (e.changed && String(e.changed).trim()) return [];
  return [
    finding(
      "CHANGED_MISSING",
      "warning",
      "adapted story does not describe what was changed from the source",
      { event: e.id, path: "changed" },
    ),
  ];
}

// ---- STORY_LENGTH ---------------------------------------------------------
// Measured practice: *The Story of the World* story sections run ~530-1,000 words,
// matching published grade-3/4 chapter ranges (500-1,000 / 1,000-1,500). A "story"
// far outside that is a summary wearing a story's clothes.
const STORY_MIN = 300;
const STORY_MAX = 700;

export function checkStoryLength(e) {
  if (!e.story) return [];
  const words = String(e.story).trim().split(/\s+/).filter(Boolean).length;
  if (words >= STORY_MIN && words <= STORY_MAX) return [];
  return [
    finding("STORY_LENGTH", "warning", `story is ${words} words (target 400-600; warning outside 300-700)`, {
      event: e.id,
      path: "story",
      words,
    }),
  ];
}

// ---- TRACE (shared by story + fields) -------------------------------------
// One trace entry per UNIT. Units are SENTENCES for prose (`summary`, `details`,
// `story`) and the whole line for `fact`/`why`. An entry is a list of claim ids.
//
// Two sentinel entries:
//   []  — declared invented/reconstructed narrative. The device, not a defect.
//   ["?"] — an assertion about the world that NO claim covers (UNRESOLVED).
//
// The unresolved token exists because narrative sentences are not only "grounded" or
// "invented" — a sentence can assert something about the world that nothing backs.
// Without a way to say so, an author must either cite a claim that does not support
// it, or bury it inside `[]`. Burying it is how an overstatement survives review
// looking like declared invention: `pyramids`' closing paragraph cited C008, so it
// read as documented, while its first sentence claimed more than C008 supports.
// `?` makes that gap visible instead of disguising it.
//
// IMPORTANT: a trace proves DECLARED PROVENANCE, not semantic entailment. A unit is
// not true because it cites a claim — only that someone declared the link.
export const UNRESOLVED = "?";
const CLAIM_ID_RE = /^C[0-9]+$/;

function validateTrace({ units, entries, claims, prefix, event, path, quietEmpty = false }) {
  const out = [];
  if (entries.length !== units.length) {
    out.push(finding(`${prefix}_COUNT`, "error",
      `${entries.length} trace entr${entries.length === 1 ? "y" : "ies"} for ${units.length} unit(s)`,
      { event, path }));
    return { findings: out, invented: 0, unresolved: 0 };
  }
  const byId = new Map(claims.map((c) => [c && c.id, c]));
  let invented = 0;
  let unresolved = 0;
  entries.forEach((ids, i) => {
    const where = `${path}[${i}]`;
    if (!Array.isArray(ids)) {
      out.push(finding(`${prefix}_SHAPE`, "error", `unit ${i + 1}: entry is not a claim list`, { event, path: where }));
      return;
    }
    if (!ids.length) {
      invented += 1;
      // `[]` in a story is the device (an invented scene), so it is counted, not
      // itemised — otherwise the trace becomes a census and buries the real defects.
      // In an expository field an invented sentence is unusual, so it is flagged.
      if (!quietEmpty) {
        out.push(finding(`${prefix}_EMPTY`, "info", `unit ${i + 1} is declared invented/reconstructed — review it`, { event, path: where }));
      }
      return;
    }
    if (ids.length === 1 && ids[0] === UNRESOLVED) {
      unresolved += 1;
      out.push(finding(`${prefix}_UNRESOLVED`, "warning",
        `unit ${i + 1} asserts something about the world with no claim behind it — ground it or rewrite it`,
        { event, path: where }));
      return;
    }
    const seen = new Set();
    for (const id of ids) {
      if (typeof id !== "string" || !CLAIM_ID_RE.test(id)) {
        out.push(finding(`${prefix}_SHAPE`, "error",
          `unit ${i + 1}: ${JSON.stringify(id)} is not a claim id or "${UNRESOLVED}"`, { event, path: where }));
        continue;
      }
      if (seen.has(id)) {
        out.push(finding(`${prefix}_DUPLICATE_CLAIM`, "error", `unit ${i + 1}: duplicate claim ${id}`, { event, path: where }));
      }
      seen.add(id);
      const c = byId.get(id);
      if (!c) {
        out.push(finding(`${prefix}_UNKNOWN_CLAIM`, "error", `unit ${i + 1}: unknown claim ${id}`, { event, path: where }));
      } else if (!c.quote || !String(c.quote).trim()) {
        out.push(finding(`${prefix}_UNSUPPORTED_CLAIM`, "error", `unit ${i + 1}: claim ${id} has no source quote`, { event, path: where }));
      }
    }
  });
  return { findings: out, invented, unresolved };
}

// ---- STORY_TRACE ----------------------------------------------------------
// Sentence-level, same unit and same validator as `fieldTrace`. It cannot judge
// whether an invented sentence is TRUE. What it can do is isolate every
// untraceable assertion and put it in front of a reviewer — which is where the
// invented-material errors (false world-claims, unsupported omniscience,
// unmotivated implication) actually live.
export function checkStoryTrace(e) {
  if (!e.story || !String(e.story).trim()) return [];
  const units = sentences(e.story);
  const claims = Array.isArray(e.claims) ? e.claims : [];
  // No claims => nothing to trace against (same scope rule as fieldTrace).
  if (!claims.length) return [];
  if (!Array.isArray(e.storyTrace)) {
    return [finding("STORY_TRACE_MISSING", "warning",
      `story has no trace (${units.length} sentence(s))`, { event: e.id, path: "storyTrace" })];
  }
  const { findings, invented, unresolved } = validateTrace({
    units, entries: e.storyTrace, claims, prefix: "STORY_TRACE", event: e.id, path: "storyTrace", quietEmpty: true,
  });
  if (invented) {
    findings.push(finding("STORY_TRACE_INVENTED", "info",
      `${invented} of ${units.length} sentence(s) invented (the device, not a defect); ${unresolved} unresolved`,
      { event: e.id, path: "storyTrace", invented }));
  }
  return findings;
}

// ---- FORMAT ---------------------------------------------------------------
// The device (see registry/devices.json). A story must declare how it is told, and
// the declared device must exist — an unknown one means the drafter got no brief.
export const DEVICE_IDS = new Set([
  "narrative", "diary", "letter", "newspaper", "biography", "micro-history", "multi-perspective",
]);

export function checkFormat(e) {
  if (!e.story) return [];
  if (DEVICE_IDS.has(e.format)) return [];
  const got = e.format ? ` (got "${e.format}")` : "";
  const too = e.format ? "error" : "warning";
  return [
    finding(
      too === "error" ? "FORMAT_UNKNOWN" : "FORMAT_MISSING",
      too,
      `story has no declared device${got} — use ${[...DEVICE_IDS].join(" | ")}`,
      { event: e.id, path: "format" },
    ),
  ];
}

// ---- META_OVERLAP ---------------------------------------------------------
// `changed` states the TREATMENT of the text (what we did to it); `storyNote` states
// the fact/fiction boundary INSIDE the story (what is record, what is invention).
// Different jobs — so one restating the other is a contract violation. Checked at a
// LOWER threshold than LAYER_REDUNDANCY because both fields are short and dense; the
// generic 0.6 threshold does not catch this pair.
export function checkMetaOverlap(e, { threshold = 0.25 } = {}) {
  if (!e.changed || !e.storyNote) return [];
  const a = contentTokens(e.changed);
  const b = contentTokens(e.storyNote);
  if (a.size < 4 || b.size < 4) return [];
  const overlap = jaccard(a, b);
  if (overlap < threshold) return [];
  return [
    finding(
      "META_OVERLAP",
      "warning",
      `changed and storyNote restate each other (overlap ${overlap.toFixed(2)}) — one states the treatment, the other the fact/fiction boundary`,
      { event: e.id, path: "changed/storyNote", overlap: Number(overlap.toFixed(2)) },
    ),
  ];
}

// ---- FIELD_TRACE ----------------------------------------------------------
// The expository surfaces (`fact`, `why`, `summary`, `details`) traced by the same
// validator, the same units and the same sentinels as `storyTrace`.
const TRACED_FIELDS = ["fact", "why", "summary", "details"];

export function checkFieldTrace(e, { grandfathered = false } = {}) {
  const present = TRACED_FIELDS.filter((f) => typeof e[f] === "string" && e[f].trim());
  if (!present.length) return [];
  // No claims => nothing to trace against. (Whether a story *should* carry claims
  // is a separate question, tracked as a follow-up.)
  if (!Array.isArray(e.claims) || !e.claims.length) return [];
  const out = [];
  const trace = e.fieldTrace;
  const severity = grandfathered ? "warning" : "error";
  if (!trace || typeof trace !== "object") {
    out.push(finding("FIELD_TRACE_MISSING", severity,
      `no field-level trace for ${present.join(", ")}`, { event: e.id, path: "fieldTrace" }));
    return out;
  }
  for (const field of TRACED_FIELDS) {
    const text = e[field];
    if (typeof text !== "string" || !text.trim()) continue;
    // `summary` and `details` are prose: trace per sentence. `fact`/`why` are single lines.
    const units = field === "summary" || field === "details" ? sentences(text) : [text.trim()];
    const entries = trace[field];
    if (!Array.isArray(entries)) {
      out.push(finding("FIELD_TRACE_MISSING", severity,
        `${field} has no trace`, { event: e.id, path: `fieldTrace.${field}` }));
      continue;
    }
    out.push(...validateTrace({
      units, entries, claims: e.claims, prefix: "FIELD_TRACE", event: e.id, path: `fieldTrace.${field}`,
    }).findings);
  }
  return out;
}

// ---- DEPTH ----------------------------------------------------------------
// Two permanent content tiers, plus the baseline:
//   deep       — a `story` (deep layer); prose is claim-traced (storyTrace/fieldTrace)
//   shallow    — a `summary`, but no story; prose is editorially reviewed against the
//                cited source, NOT claim-grounded. This is a declared state, not debt.
//   fact-only  — fact/why only; no prose layer to ground.
// `depth` is DERIVED, never stored — a stored copy could contradict the content it
// describes (same rule as precision/certainty).
export function eventDepth(e) {
  if (typeof e.story === "string" && e.story.trim()) return "deep";
  if (typeof e.summary === "string" && e.summary.trim()) return "shallow";
  return "fact-only";
}

export function checkDepth(e) {
  if (eventDepth(e) !== "shallow") return [];
  return [finding("DEPTH_SHALLOW", "info",
    "shallow tier: summary is editorially reviewed, not claim-grounded",
    { event: e.id, path: "summary" })];
}

// ---- SPINE (goal-directed episode) ----------------------------------------
// A story that is only a sequence reads as a scene tour, not a story: readers ask
// "and then?" instead of "why?". The evidence-based unit is the goal-directed
// episode — want -> obstacle -> turn -> outcome — with the target facts sitting on
// that causal chain, not decorating it.
//
// The spine is declared BEFORE writing (same reason `format` and `pointOfView` are
// declared fields: the drafter is told what to write, the reviewer has something to
// check against). Whether the stake is settleable is NOT mechanisable — it is a
// policy in universalRules plus a human read. We do not fake a heuristic for it.
const SPINE_BEATS = ["want", "obstacle", "turn", "outcome"];

export function checkSpine(e) {
  const hasStory = typeof e.story === "string" && e.story.trim();
  const spine = e.storySpine;
  const out = [];
  if (!spine && !hasStory) return out;
  if (!spine) {
    return [finding("SPINE_MISSING", "warning",
      "story has no declared spine — declare want/obstacle/turn/outcome before writing",
      { event: e.id, path: "storySpine" })];
  }
  if (!hasStory) {
    return [finding("SPINE_UNUSED", "info",
      "storySpine declared but there is no story", { event: e.id, path: "storySpine" })];
  }
  if (typeof spine !== "object" || Array.isArray(spine)) {
    return [finding("SPINE_SHAPE", "error", "storySpine must be an object", { event: e.id, path: "storySpine" })];
  }
  for (const beat of SPINE_BEATS) {
    const v = spine[beat];
    if (typeof v !== "string" || !v.trim()) {
      out.push(finding("SPINE_SHAPE", "error", `storySpine.${beat} is missing or empty`, { event: e.id, path: `storySpine.${beat}` }));
    }
  }
  return out;
}

// ---- EXPOSITION (is this block still a scene?) -----------------------------
// Ported in DESIGN from history-tales' ESSAY_BLOCK / EXPOSITION_DRIFT — not in
// expression. Their repo carries no licence file, and their vocabularies are
// war-documentary anyway; ours are written for children's historical narrative.
//
// The test: a long block with no ACTOR, no SENSORY token and no ACTION verb has
// stopped telling a story and become an essay. That is the deterministic proxy for
// the "directionless prose" failure — it cannot judge whether a story is GOOD, only
// whether a block is still narrative at all.
//
// Heuristic, therefore warning-level, not error — same stance as LAYER_REDUNDANCY
// (a triage flag, not a verifier). Honest limit: because our prose is pronoun-led
// and its actors are declared, this rarely fires on current content. It is a guard
// against drift — particularly once machine drafters write stories — not a scorer.
const SENSORY = /\b(see|saw|seen|hear|heard|sound|smell|smelt|felt|feel|touch|taste|warm|cold|hot|cool|dark|light|bright|dim|loud|quiet|hush|dust|smoke|wind|rain|sun|sunlight|shadow|stone|rock|water|river|canal|mud|clay|sand|dry|wet|damp|rough|smooth|sharp|heavy|empty|full|tall|wide|glare|gleam|glint|echo|rumble|creak|clatter|thud|scrape|shout|shouting|murmur|hum|whisper|sweat|ache|sting|burn|chill|breathe|breath)\b/i;
const ACTION = /\b(found|went|came|stood|walked|ran|looked|watched|waited|carried|hauled|pulled|pushed|lifted|climbed|listened|called|held|dropped|filled|followed|reached|turned|crossed|opened|closed|set|laid|dug|cut|built|made|took|gave|left|kept|put|sat|slept|woke|rose|fell|leaned|slipped|passed|pointed|stopped|began|started)\b/i;
// Personal pronouns only. "it"/"its" are excluded: they usually stand for a thing,
// not an actor, so counting them would let a castless abstract block pass.
const PRONOUN = /\b(he|him|his|she|her|hers|they|them|their)\b/i;

// An actor counts if a DECLARED character is named (substring, case-insensitive —
// their extractor required two capitalised words, so a one-word name like "Meryt"
// was invisible to it), or if a pronoun appears AND the event declares a cast for
// it to refer to. Without that gate, pronoun-led narrative would make this vacuous.
function isExposition(block, characters) {
  const lower = block.toLowerCase();
  if (characters.some((c) => lower.includes(String(c).toLowerCase()))) return false;
  if (characters.length && PRONOUN.test(block)) return false;
  if (SENSORY.test(block)) return false;
  if (ACTION.test(block)) return false;
  return true;
}

export function checkExposition(e, { blockThreshold = 45, maxConsecutive = 3, maxFlagged = 5 } = {}) {
  if (!e.story || !String(e.story).trim()) return [];
  const characters = (Array.isArray(e.characters) ? e.characters : [])
    .filter((c) => typeof c === "string" && c.trim());
  const out = [];
  let flagged = 0;
  let run = 0;
  paragraphs(e.story).forEach((block, i) => {
    const words = block.split(/\s+/).filter(Boolean).length;
    if (words < blockThreshold || !isExposition(block, characters)) {
      run = 0;
      return;
    }
    run += 1;
    if (flagged < maxFlagged) {
      flagged += 1;
      out.push(finding("ESSAY_BLOCK", "warning",
        `paragraph ${i + 1} (${words} words) has no actor, no sensory detail and no action — it reads as exposition, not a scene`,
        { event: e.id, path: "story" }));
    }
    if (run === maxConsecutive + 1) {
      out.push(finding("EXPOSITION_DRIFT", "warning",
        `${run} consecutive exposition paragraphs, ending at ${i + 1}`, { event: e.id, path: "story" }));
    }
  });
  return out;
}

// ---- STORY READABILITY ----------------------------------------------------
// `READABILITY_BAND` graded only `summary`, so a story could read at grade 12 and
// nothing would say a word. Measured on real content, the story is fine on AVERAGE
// (grade 4.1) while hiding a 37-word sentence — which is the general problem with
// Flesch–Kincaid: it averages, so it cannot see outliers, and on short texts with
// proper nouns, dates and quotations it distorts (see the editorial checklist).
//
// So the story gets two checks, and they earn their place differently:
//   STORY_READABILITY   — a band, to catch DRIFT (a drafter producing grade-10 prose)
//   SENTENCE_OVER_LIMIT — outliers, the defect an average cannot see
//
// Band rationale: ages 8–11 are grades 3–5. The story is typically READ ALOUD by an
// adult, and comprehension of read-aloud text runs ~2 grades above a child's
// independent level — which is also the slack FK needs for its known inflation on
// names and dates. Hence 3–7, wider than the summary's 3–9 only at the bottom in
// spirit: it is a range check, not a target.
export function checkStoryReadability(e, { min = 3, max = 7 } = {}) {
  const text = e.story;
  if (typeof text !== "string" || !text.trim()) return [];
  const grade = fleschKincaidGrade(text);
  if (grade < min || grade > max) {
    return [
      finding("STORY_READABILITY", "warning",
        `story grade ${grade.toFixed(1)} outside ${min}–${max}`,
        { event: e.id, path: "story", grade: Number(grade.toFixed(1)) }),
    ];
  }
  return [];
}

// Sentence-length outliers. The per-sentence limit is deliberately loose (30): our
// own longest legitimate narrative sentence is 25 words, and the failure mode we
// care about is the one FK hides, not mildly long prose. The average guard (18) is
// the "plain language" floor from the editorial checklist.
export function checkSentenceLength(e, { maxWords = 30, avgMax = 18, maxFlagged = 5 } = {}) {
  if (!e.story || !String(e.story).trim()) return [];
  const units = sentences(e.story);
  if (!units.length) return [];
  const lens = units.map((s) => s.split(/\s+/).filter(Boolean).length);
  const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
  const out = [];
  units.forEach((s, i) => {
    if (lens[i] > maxWords && out.length < maxFlagged) {
      out.push(finding("SENTENCE_OVER_LIMIT", "warning",
        `story sentence ${i + 1} is ${lens[i]} words (limit ${maxWords})`,
        { event: e.id, path: "story", words: lens[i], excerpt: s.slice(0, 70) + (s.length > 70 ? "…" : "") }));
    }
  });
  if (avg > avgMax) {
    out.push(finding("SENTENCE_AVG_HIGH", "warning",
      `story averages ${avg.toFixed(1)} words per sentence (limit ${avgMax})`,
      { event: e.id, path: "story", average: Number(avg.toFixed(1)) }));
  }
  return out;
}

// ---- STORY_OFF_EVENT -----------------------------------------------------
// Does the story dramatise THIS event? The layer contract stopped a story from
// *repeating* summary/details, but nothing required it to be *about* the event. Four
// fresh drafts then dramatised adjacent subjects: "Traditional founding of Rome" got a
// story about archaeology while the card itself reads `who: "Romulus (legend)"`;
// "Alexander the Great dies" got a mutiny four years earlier; "Homer's Iliad and
// Odyssey composed" got a festival singer rather than the poems.
//
// `identityClaims` declares which claim(s) state what the event IS — deliberately
// DECLARED, because deriving it was tried and failed in both directions at once.
// Deriving it from `fieldTrace.fact`:
//   - false-POSITIVED `pyramids`: its `fact` is a legacy statement ("tallest for more
//     than 3,700 years"), so the story about the building legitimately never cites it;
//   - false-NEGATIVED `rome-founded`: its `fieldTrace.fact` includes a context claim
//     ("settlements emerged"), so a story about archaeology passed by citing background.
// Identity is an editorial judgement — same reason `format` and `storySpine` are declared.
//
// LIMIT, stated plainly: this checks CITATION, not centrality. A story can cite its
// identity claim and still be about something else. The faithfulness literature
// (FactCC, SummaC, AttrScore) shares this blind spot — they ask "is this supported?",
// never "is this *about* it?".
export function identityClaimSet(e) {
  return new Set(Array.isArray(e.identityClaims) ? e.identityClaims : []);
}

export function checkStoryRelevance(e) {
  if (!e.story || !String(e.story).trim()) return [];
  const claims = Array.isArray(e.claims) ? e.claims : [];
  if (!claims.length) return [];
  if (!Array.isArray(e.identityClaims) || !e.identityClaims.length) {
    return [finding("IDENTITY_CLAIMS_MISSING", "warning",
      "story-bearing event must declare identityClaims — the claim(s) stating what this event IS",
      { event: e.id, path: "identityClaims" })];
  }
  const out = [];
  const known = new Set(claims.map((c) => c && c.id));
  const identity = identityClaimSet(e);
  for (const id of identity) {
    if (!known.has(id)) {
      out.push(finding("IDENTITY_CLAIM_UNKNOWN", "error",
        `identityClaims cites unknown claim ${id}`, { event: e.id, path: "identityClaims" }));
    }
  }
  const cited = new Set(
    (Array.isArray(e.storyTrace) ? e.storyTrace : []).flat()
      .filter((x) => typeof x === "string" && x !== UNRESOLVED),
  );
  if (![...identity].some((id) => cited.has(id))) {
    out.push(finding("STORY_OFF_EVENT", "warning",
      `story cites none of the claims stating this event's identity (${[...identity].join(", ")}) — it may dramatise an adjacent event`,
      { event: e.id, path: "story", identityClaims: [...identity] }));
  }
  // `fact` is the headline: it should state what HAPPENED. If the identity claim is not
  // among the claims backing it, the two describe different things — usually `fact`
  // drifting into significance, which is a `why` job.
  const factClaims = new Set(
    (e.fieldTrace && Array.isArray(e.fieldTrace.fact) ? e.fieldTrace.fact : []).flat(),
  );
  if (factClaims.size && ![...identity].some((id) => factClaims.has(id))) {
    out.push(finding("IDENTITY_NOT_IN_FACT", "info",
      "the identity claim is not among the claims backing `fact` — check that `fact` states what happened rather than why it mattered",
      { event: e.id, path: "fieldTrace.fact" }));
  }
  return out;
}
