// Anticipation layer of the pronunciation QA system — AUTHOR-TIME ONLY.
//
// `generate.mjs --listen` is the *evidence* step: a human listens and flags
// mispronunciations. This is the step before it, and it has two halves.
//
// ANTICIPATE — spelling and names. Which words a listening pass is most
// likely to trip over: spellings that depart from everyday English
// orthography (non-ASCII, rare clusters, bare q, very long words, Latinate
// plurals), context-sensitive homographs, and — the part that is easy to
// skip and impossible to recover from — every PROPER NOUN in the fact text.
// A name is the one word in a sentence with no ordinary English reading to
// fall back on, so "Sundiata" is exactly as risky as "theses" and nothing
// about its spelling says so.
//
// MEASURE — reference.mjs. Spelling only guesses. So every candidate is
// compared against the CMU Pronouncing Dictionary, which splits the list
// into words the engine already gets right (no ear time), words it gets
// measurably wrong (a LEXICON respelling fixes those), and words no
// dictionary has ever heard of (only a human can settle those). Without
// the dictionary installed the audit still runs, on spelling alone.
//
// Findings come in four tiers, deliberately ordered by what they cost you:
//   disagrees    the engine's stress or stressed vowel contradicts the
//                dictionary. Actionable today: a respelling plus a machine
//                check (lexicon-records.mjs).
//   no-reference no dictionary entry — a name, a transliterated place, a
//                loanword. THE RECALL CHECK: this tier exists so that such
//                a word cannot be silently skipped. Needs a human source.
//   context      a homograph: the reading depends on the sentence, so a
//                dictionary comparison proves nothing either way.
//   agrees       verified against the dictionary. Nothing to do; the point
//                of this tier is that it is most of the list.
//
// HARD (exit 1) — a defect, not a candidate: a year leak surviving the
// recipe, or a LEXICON entry that no deck speaks any more.
//
// Usage:  node tools/narration/audit.mjs [--json] [--only <event-id|word>]
//                                 [--deck <id>] [--strips] [--force]
// Deps:   none required — the reference layer and the phoneme column are
//         both optional and degrade to bare words without them. --strips
//         additionally needs ffmpeg and the model.
"use strict";

import { readdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { LEXICON, applyLexicon, spokenText, stripYearSpans, yearLeaks } from "./text.mjs";
import { RECORDS } from "./lexicon-records.mjs";
import { phonemizerAvailable } from "./pronounce.mjs";
import { AGREES, DISAGREES, NO_REFERENCE, classify, dictionaryForms, referenceAvailable } from "./reference.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The two tiers the reference layer does not produce. */
export const CONTEXT = "context";
export const UNVERIFIED = "unverified";

/** Listening order, and the report order: worst news first. */
export const TIERS = [DISAGREES, NO_REFERENCE, CONTEXT, AGREES];

/** Every folder deck in the repo, as { dir, deck }. */
function loadDecks() {
  const decksDir = join(REPO_ROOT, "decks");
  return readdirSync(decksDir)
    .filter((name) => existsSync(join(decksDir, name, "deck.json")))
    .map((name) => ({
      dir: name,
      deck: JSON.parse(readFileSync(join(decksDir, name, "deck.json"), "utf8")),
    }));
}

/**
 * A word is a run of letters — UNICODE letters, and that is load-bearing.
 * The old ASCII pattern `[A-Za-z][A-Za-z'’-]*` could not match a macron, so
 * "Māori" was tokenised as the single letter "M", which quietly disabled
 * three things at once: the non-ASCII spelling rule (it could never match,
 * because the tokeniser never handed it a non-ASCII character), the
 * proper-noun scan, and the name's route to the reference tier. Māori
 * orthography is not a rare edge case in this corpus's subject matter, and a
 * spelling rule that silently never fires is worse than no rule.
 */
const WORD = /[\p{L}][\p{L}\p{M}'’-]*/gu;

// Context-sensitive words a G2P is liable to get wrong in prose (lead the
// metal / lead us, live / present tense, wind / to wind, record / record).
// Hand-kept: a screen for the ear, not a language model.
const HOMOGRAPHS = new Set([
  "lead", "read", "live", "lives", "wind", "wound", "bass", "bow", "dove",
  "tear", "minute", "object", "present", "record", "refuse", "project",
  "content", "invalid", "moderate", "contract", "desert", "produce", "sow",
  "row", "close", "use", "steep", "sewer", "resume", "consort",
]);

// Spellings that announce a loanword, an archaeological name, or a Latin
// plural — the categories that fool a letter-to-sound engine. Deliberately
// conservative: an early version flagged "watches" (tch), "child" (ch+i),
// "missions" (-ons) and "he’s" (typographic apostrophe), which is noise an
// ear cannot act on. These are now only the FIRST filter: the reference
// comparison, not this list, decides what is worth hearing.
//
// They are tested against the word with its typographic apostrophes folded to
// straight ones. U+2019 is a punctuation variant, not a spelling: without the
// fold, "Caesar’s" and every other possessive in the corpus joins the
// non-ASCII queue and buries the names it was meant to find. The rule is
// "contains a non-ASCII CHARACTER", not "contains a non-letter" — a token may
// legitimately carry an ASCII hyphen ("X-ray", "post-civil"), and reading that
// as an accent flagged most of the compound-word titles in the corpus.
const RISKY_SPELLING = [
  [/[^\p{ASCII}]/u, "non-ASCII"], // Taíno, Göbekli, Māori
  [/tz|zh|kh|sch/, "rare cluster"], // Tenochtitlan, Zoroastrian
  [/q(?![uU])/, "bare q"], // Iraq, Qufu
  [/[a-z]{12,}/, "long word"], // Mycenaeans, industrialisation
  [/(ia|ae)$/i, "Latin plural"], // criteria, millennia
];

/** Typographic apostrophes folded, for the spelling rules above. */
const foldApostrophes = (word) => word.replace(/[\u2018\u2019]/g, "'");

/**
 * The sentence a word sits in, for the context strips. Sentence ends are
 * ". " followed by a capital — "c. 1500" and "B.C." are not sentences, and
 * splitting on them chops a line in half for no reason.
 */
function sentenceAround(text, index) {
  const starts = [...text.matchAll(/(?:^|[.!?…]\s+)(?=[A-Z(“"'])/g)]
    .map((m) => m.index + m[0].length)
    .filter((i) => i <= index);
  const start = starts.length ? starts[starts.length - 1] : 0;
  const end = text.slice(index).match(/[.!?…]\s+(?=[A-Z(“"'])/);
  return text.slice(start, end ? index + end.index + 1 : text.length).trim();
}

/**
 * Proper nouns in the FACT text — sentence case, where a capital really is a
 * name on its own. Kept as a separate signal from spokenCaps() because it
 * needs no dictionary, and therefore still works when the reference layer is
 * not installed.
 */
function factNames(event) {
  const fact = applyLexicon(stripYearSpans(event.fact || ""));
  const out = [];
  for (const m of fact.matchAll(WORD)) {
    const word = m[0];
    if (!/^\p{Lu}/u.test(word)) continue;
    // Sentence-initial capitals are not evidence of anything on their own;
    // addDictionaryNames() picks those up when a dictionary is available.
    if (/(?:^|[.!?…]\s+)$/.test(fact.slice(0, m.index))) continue;
    out.push(word);
  }
  return out;
}

/**
 * Every capitalised word of the SPOKEN text, with the index it sits at.
 *
 * This is one list for all three places a name hides: mid-sentence in a fact
 * (where a capital is already evidence), at the start of a sentence (where it
 * is not), and in a title (where every word is capitalised, so it is not
 * either). What separates a name from an ordinary word in the last two cases
 * is the dictionary, not the capital — see addDictionaryNames().
 */
function spokenCaps(spoken) {
  return [...spoken.matchAll(WORD)]
    .filter((m) => /^\p{Lu}/u.test(m[0]))
    .map((m) => ({ word: m[0].toLowerCase(), at: m.index }));
}

/**
 * Scan one card. Exported so a test can put a synthetic card through the
 * pipeline and assert the CLASS is covered — a name nobody has heard of, in
 * a fact, in a title, or spelled with a macron — without editing a deck.
 */
export function analyseEvent(event) {
  const spoken = spokenText(event);
  const risk = new Map(); // lowercased word -> { count, whys, contexts }
  const names = new Map();
  const hard = [];

  for (const leak of yearLeaks(spoken)) {
    hard.push(`year leak in spoken text: ${JSON.stringify(leak)}`);
  }

  const add = (bucket, key, why, context) => {
    const prev = bucket.get(key) ?? { count: 0, whys: new Set(), contexts: [], events: new Set() };
    prev.count += 1;
    prev.whys.add(why);
    prev.events.add(event.id);
    if (context && !prev.contexts.includes(context)) prev.contexts.push(context);
    bucket.set(key, prev);
  };

  for (const m of spoken.matchAll(WORD)) {
    const word = m[0];
    const lower = word.toLowerCase();
    const spelled = foldApostrophes(lower);
    for (const [re, why] of RISKY_SPELLING) {
      if (re.test(spelled)) add(risk, lower, why, sentenceAround(spoken, m.index));
    }
    if (HOMOGRAPHS.has(lower)) add(risk, lower, "homograph", sentenceAround(spoken, m.index));
  }

  for (const word of factNames(event)) {
    add(names, word.toLowerCase(), "proper noun", sentenceAround(spoken, spoken.indexOf(word)));
  }

  const lexHits = [...LEXICON.keys()].filter((k) => new RegExp(`\\b${k}\\b`, "i").test(spoken));
  return { id: event.id, title: event.title, spoken, risk, names, caps: spokenCaps(spoken), hard, lexHits };
}

export function audit() {
  return loadDecks().map(({ dir, deck }) => {
    const events = deck.events.map(analyseEvent);
    // Raw source text, BEFORE the lexicon respellings are applied: a lexicon
    // word is by definition absent from its own spoken output.
    const source = deck.events.map((e) => `${e.title ?? ""} ${e.fact ?? ""} ${e.why ?? ""}`).join(" ");
    return {
      deck: dir,
      cardCount: events.length,
      events,
      source,
    };
  });
}

/** LEXICON entries no deck speaks any more — stale fixes, to be removed. */
export function deadLexicon(results) {
  const all = results.map((r) => r.source).join(" ");
  return [...LEXICON.keys()].filter((k) => !new RegExp(`\\b${k}\\b`, "i").test(all));
}

/**
 * One deck's candidate words, ranked: every risky spelling, every homograph,
 * and every proper noun in the fact text.
 * @returns {Map<string, { count: number, whys: Set<string>, contexts: string[], events: Set<string>, name: boolean }>}
 */
export function candidates(deckResult) {
  const out = new Map();
  const add = (key, source) => {
    const prev = out.get(key) ?? { count: 0, whys: new Set(), contexts: [], events: new Set(), name: false };
    prev.count += source.count;
    for (const why of source.whys) prev.whys.add(why);
    for (const id of source.events) prev.events.add(id);
    for (const context of source.contexts) {
      if (!prev.contexts.includes(context)) prev.contexts.push(context);
    }
    out.set(key, prev);
  };
  for (const event of deckResult.events) {
    for (const [word, info] of event.risk) add(word, info);
    for (const [word, info] of event.names) {
      add(word, info);
      out.get(word).name = true;
    }
  }
  return out;
}

/**
 * Sort one deck's candidates into the four tiers.
 *
 * @param {ReturnType<typeof audit>[number]} deckResult
 * @returns {Promise<{ deck: string, findings: object[], counts: Record<string, number> }>}
 */export async function triage(deckResult) {
  const pool = candidates(deckResult);
  const measured = await referenceAvailable();
  if (measured) addDictionaryNames(deckResult, pool);
  const findings = [];
  for (const [word, info] of pool) {
    // Tested against the list itself, not against the pool's `whys`: a word
    // can reach the pool by another route first (a long word, say) and
    // addDictionaryNames() then leaves it alone, which would quietly drop the
    // label and put the word back in the "verified" bucket.
    const borrowed = BORROWED_NAMES.has(word);
    if (borrowed) info.whys.add("borrowed name");
    const finding = {
      word,
      count: info.count,
      name: info.name,
      why: [...info.whys],
      events: [...info.events],
      context: info.contexts[0] ?? "",
      tier: UNVERIFIED,
      engine: null,
      dict: null,
      note: "",
    };
    if (!measured) {
      // No dictionary: spelling is all we have, and the verdict is honest
      // about that rather than pretending to be measured.
      finding.note = "no reference layer — spelling only";
      findings.push(finding);
      continue;
    }
    const result = await classify(word);
    finding.engine = result.engine;
    finding.dict = result.dict;
    // An independently sourced reading, when WikiPron has been fetched. It
    // is printed for a human to weigh and never moves the tier — see the
    // note on `tidyIpaReading` in reference.mjs.
    finding.second = result.second ?? null;
    // A homograph's reading is chosen by its sentence, so a mismatch
    // against the dictionary's first entry is not evidence of anything.
    // It still goes in front of the ear — with the sentence attached.
    // A "borrowed name" is the same idea from the other direction: the
    // dictionary HAS an entry, but that entry is the anglicisation, so
    // agreement between engine and dictionary is not reassurance here.
    //
    // Tested against the list itself, not against the pool's `whys` — see the
    // note where `borrowed` is computed.
    finding.tier = info.whys.has("homograph") || borrowed ? CONTEXT : result.tier;
    finding.note =
      finding.tier === CONTEXT
        ? `engine says ${result.engine ?? "?"}${result.dict ? `, dictionary ${result.dict}` : ""} — check it in this sentence`
        : result.note;
    findings.push(finding);
  }
  findings.sort(
    (a, b) =>
      TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) ||
      Number(b.name) - Number(a.name) ||
      b.count - a.count ||
      a.word.localeCompare(b.word)
  );
  return { deck: deckResult.deck, findings, counts: countTiers(findings) };
}

/** Tier histogram for a findings list. */
export function countTiers(findings) {
  const counts = Object.fromEntries(TIERS.map((t) => [t, 0]));
  for (const f of findings) if (f.tier in counts) counts[f.tier] += 1;
  return counts;
}

/**
 * A capitalised word is a name when the dictionary has no entry for it.
 *
 * This is the recall half of the audit, and it covers all three hiding places
 * with one rule. It is where "Aotearoa" lived: the name is in the card's
 * title and in no fact, and titles used to be skipped wholesale because
 * capitalisation cannot tell "Settle" from "Sumer". The same rule catches a
 * name at the start of a sentence, where a capital is likewise no evidence.
 * Across the decks it surfaces Sumer, Zanj, Uruk, Odoacer, Wollstonecraft,
 * Shikibu, Berners-Lee, Taíno, Buendía, Márquez — words the spelling screen
 * either could not see or would have passed over in silence.
 */
/**
 * Words the dictionary knows but whose entry is very likely an ANGLICISATION,
 * so agreement with CMUdict is not reassurance.
 *
 * English borrows the name of a foreign place, person or institution and then
 * spells it with ordinary English letters, at which point the dictionary
 * records the English reading of those letters rather than the name. "Bastille"
 * is the worked example: the card that mentions it does so in the title alone
 * (the fact says "a royal fortress"), CMUdict has B AE1 S T IH0 L, and that
 * entry was precisely what stopped the word ever being examined — English
 * dictionaries put the stress on the first syllable while the OED-cited
 * General American reading is /bæˈstil/, second syllable.
 *
 * This list is CURATED, and deliberately so. Three automatic ways of guessing
 * were tried and all three failed: admitting every interior capital queued 475
 * words for the ear (unlistenable, since the queue's value is that it is
 * short); "a word that never appears lowercase in the deck" matched 508 of 594
 * in cc-timeline, because ordinary title words recur in other cards' titles
 * rather than in prose; and a title-only test needed the fact text, which
 * analyseEvent() does not retain. There is no cheap signal that separates
 * "Bastille" from "Empire" — both are interior capitals in a title — so the
 * judgement has to be a human one, made against a source.
 *
 * Add a word when you have confirmed with a reference that the engine reads it
 * differently from the name. It is a list of *suspicions that turned out to
 * be justified*, not a list of all foreign words in the decks.
 */
const BORROWED_NAMES = new Set([
  "bastille", // English GA /bæˈstil/ and RP /bæˈstiːl/ vs CMUdict's B AE1 S T IH0 L.
  // A LEXICON respelling now handles the word itself, so it no longer needs to
  // be QUEUED — but keeping it here records that the dictionary's reading is
  // not to be trusted for it, which is the thing a future maintainer needs.
  "constantinople", // a card title, dictionary-known, and a borrowed name
]);

/**
 * The curated borrowed-name list, exported so a test can assert that every
 * entry is still a real word in a real deck. A silent, stale list would
 * reinstate the blind spot it exists to close.
 */
export const borrowedNames = () => [...BORROWED_NAMES];

export function addDictionaryNames(deckResult, pool) {
  for (const event of deckResult.events) {
    for (const { word, at } of event.caps ?? []) {
      if (pool.has(word)) continue;
      if (BORROWED_NAMES.has(word)) {
        pool.set(word, {
          count: 1,
          whys: new Set(["borrowed name"]),
          contexts: [sentenceAround(event.spoken, at)],
          events: new Set([event.id]),
          name: true,
        });
        continue;
      }
      if (dictionaryForms(word).length) continue; // an ordinary word
      pool.set(word, {
        count: 1,
        whys: new Set(["proper noun"]),
        contexts: [sentenceAround(event.spoken, at)],
        events: new Set([event.id]),
        name: true,
      });
    }
  }
}

/** Every deck, triaged. */
export async function triageAll() {
  return Promise.all(audit().map(triage));
}

/** The words worth hearing, in listening order (verified words excluded). */
export function needsEar(triageResult) {
  return triageResult.findings.filter((f) => f.tier !== AGREES);
}

/**
 * The `no-reference` words, as a research worksheet.
 *
 * These are the words no dictionary knows — the Sundiatas and Tenochtitlans of
 * the corpus — so nothing offline can settle them and the only route is a
 * lookup plus judgement. The count is large enough (159 across four decks at
 * the time of writing) that "go and think about it" is not a plan, so this
 * turns the tier into a list with a workflow column.
 *
 * The workflow states are RESEARCH states and deliberately do not live in
 * lexicon-records.mjs: only the terminal outcomes do, so the permanent record
 * never carries half-finished work. `open → researched → fixed | confirmed |
 * deferred`, where `confirmed` is a real result — the engine was already right
 * — and saying so is what stops a future audit re-raising the word.
 *
 * @param {{ deck: string, findings: object[] }} triageResult
 * @returns {{ word: string, deck: string, count: number, engine: string|null,
 *   events: string[] }[]}
 */
export function worksheetRows(triageResult) {
  return triageResult.findings
    .filter((f) => f.tier === NO_REFERENCE)
    .map((f) => {
      // A word that already has a record has reached a terminal outcome — the
      // engine reads it correctly, or a respelling was shipped, or it was
      // investigated and is out of reach. It still appears here because it still
      // has no dictionary entry, so showing it as `open` would send someone off
      // to redo finished work.
      const record = RECORDS.get(f.word) ?? null;
      return {
        word: f.word,
        deck: triageResult.deck,
        count: f.count,
        engine: f.engine ?? null,
        events: f.events ?? [],
        record,
        settled: record != null,
      };
    });
}

/**
 * Where a researcher should look, in the order that is actually worth trying.
 *
 * The first step is the one people skip, and skipping it is how a false
 * "no reference exists" gets written into a record: the English exonym usually
 * has no Wiktionary entry, while the name under its *own script* has a good one
 * — often with a dialect chain and a Descendants block that names the English
 * form outright. `Cleisthenes` 404s; `Κλεισθένης` carries
 * `→ English: Clisthenes (learned)`.
 */
const LOOK_FIRST = [
  "Wiktionary **under the name's own script**, not the English exonym — Κλεισθένης, " +
    "بابر, मुगल, Τενοχτιτλάν. An English-only lookup returns 404 and looks like a dead end.",
  "That entry's **Descendants** block: it names the modern form and the English " +
    "learned form, which is the citation for whatever anglicised reading we ship.",
  "Wiktionary's IPA **chain** across dialects, to see which part of the form is " +
    "reconstruction and which part a living language still says.",
  "Wikipedia: the article's first line, plus the `{{IPAc-}}`/`{{respell}}` field in " +
    "the wikitext (hand-maintained convention, not a recording) — this is the closest " +
    "thing to \"the form an English textbook uses\".",
  "Corpus **counts** (YouGlish) to learn how rare the word is in speech. Ignore the " +
    "auto-generated \"sound it out\" breakdown it prints; it is boilerplate.",
  "Recordings by identified native speakers (Forvo) — low quality, but the useful " +
    "output is the *range*, not any one take.",
  "A specialist dictionary or grammar for the language or period involved.",
];

/**
 * Render the worksheet as markdown, for filling in by hand.
 *
 * `whereToLook` is deliberately a short ranked list rather than a link farm:
 * the point is to make the first attempt productive, not to enumerate every
 * corpus that might have an answer.
 */
export function renderWorksheet(rowsByDeck) {
  const rows = rowsByDeck.flatMap((r) => r.rows);
  const open = rows.filter((r) => !r.settled);
  const out = [];
  out.push("# Pronunciation lookup worksheet");
  out.push("");
  out.push(
    `**${open.length} open** of ${rows.length} word(s) that no reference dictionary ` +
      "knows. The rest already have a record in `lexicon-records.mjs` — a shipped " +
      "fix, a confirmation that the engine was right, or a documented deferral — " +
      "and are listed so the outcome is visible, not because they need work."
  );
  out.push("");
  out.push(
    "For a word you fix: add the alias to `LEXICON` (`text.mjs`) AND a record to " +
      "`lexicon-records.mjs`. The suite fails on either one alone."
  );
  out.push("");
  out.push("Status values: `open` → `researched` → `fixed` | `confirmed` | `deferred`.");
  out.push("");
  out.push("| word | deck | ×n | engine says | what is the right reading? | source | status |");
  out.push("|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const answer = r.count > 1 ? `**DECIDE** — ${r.count} occurrences: ${r.events.join(", ")}` : "—";
    if (r.settled) {
      const rec = r.record;
      out.push(
        `| \`${r.word}\` | ${r.deck} | ${r.count} | \`${r.engine ?? "?"}\` | ${rec.reason} | \`${rec.source.kind}\` | \`${rec.status}\` |`
      );
    } else {
      out.push(`| \`${r.word}\` | ${r.deck} | ${r.count} | \`${r.engine ?? "?"}\` | ${answer} | | \`open\` |`);
    }
  }
  out.push("");
  out.push("## Where to look, in order");
  out.push("");
  LOOK_FIRST.forEach((l, i) => out.push(`${i + 1}. ${l}`));
  out.push("");
  out.push(
    "A lookup is a *proposal*, not a verdict. The gate that cannot be faked is " +
      "`phonemesFor(alias) === record.phoneme`, which runs the engine's own " +
      "phonemizer — so write the respelling, run the test, and let it disagree " +
      "if it disagrees. The ear settles what a machine cannot."
  );
  out.push("");
  return out.join("\n");
}

const TIER_LABEL = {
  [DISAGREES]: "DISAGREES WITH THE DICTIONARY — a LEXICON respelling will fix these",
  [NO_REFERENCE]: "NEEDS A HUMAN SOURCE — no dictionary entry; nothing but the ear can settle these",
  [CONTEXT]: "CONTEXT-SENSITIVE — hear it in its own sentence",
  [AGREES]: "VERIFIED AGAINST THE DICTIONARY — no ear time needed",
  [UNVERIFIED]: "UNVERIFIED — spelling only (no dictionary installed)",
};

function report(result) {
  const { findings, counts } = result;
  const unverified = findings.filter((f) => f.tier === UNVERIFIED).length;
  const summary = [...TIERS, UNVERIFIED]
    .filter((t) => (t === UNVERIFIED ? unverified : counts[t]))
    .map((t) => `${t === UNVERIFIED ? unverified : counts[t]} ${t}`)
    .join(", ");
  console.log(`\n[${result.deck}] ${summary || "nothing to check"}`);
  for (const tier of [...TIERS, UNVERIFIED]) {
    const rows = findings.filter((f) => f.tier === tier);
    if (!rows.length) continue;
    console.log(`  ${TIER_LABEL[tier]}`);
    for (const f of rows) {
      const tags = [f.name ? "name" : "", ...f.why, f.count > 1 ? `×${f.count}` : ""]
        .filter(Boolean)
        .join(", ");
      const heard = f.engine ? `  ${f.engine}` : "";
      const ref = f.dict ? ` vs ${f.dict}` : "";
      const second = f.second ? ` ‖ wikipron ${f.second}` : "";
      const note = f.note ? `  — ${f.note}` : "";
      console.log(`  · ${f.word.padEnd(20)} ${String(f.engine ?? "").padEnd(22)}${tags ? `[${tags}]` : ""}${heard}${ref}${second}${note}`);
      if (f.tier === CONTEXT && f.context) console.log(`    ${f.context}`);
    }
    console.log("");
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");
  const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
  const deckFilter = argv.includes("--deck") ? argv[argv.indexOf("--deck") + 1] : null;
  const wantStrips = argv.includes("--strips");
  const wantWorksheet = argv.includes("--worksheet");
  const results = audit();
  const hard = results.flatMap((r) => r.events.flatMap((e) => e.hard.map((h) => `${r.deck}/${e.id}: ${h}`)));
  const dead = deadLexicon(results);
  if (dead.length) hard.push(`dead LEXICON entries (spoken by no deck): ${dead.join(", ")}`);

  let triaged = await triageAll();
  if (deckFilter) triaged = triaged.filter((t) => t.deck === deckFilter);
  if (only) {
    // --only takes an event id, but a word is what a reader has in hand,
    // so accept either rather than answering "nothing to check".
    const isEvent = results.some((r) => r.events.some((e) => e.id === only));
    const needle = only.toLowerCase();
    triaged = triaged.map((t) => {
      const findings = isEvent
        ? t.findings.filter((f) => f.events.includes(only))
        : t.findings.filter((f) => f.word === needle);
      return { ...t, findings, counts: countTiers(findings) };
    });
  }

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          decks: triaged,
          hard,
          dead,
          reference: await referenceAvailable(),
          phonemizer: await phonemizerAvailable(),
        },
        null,
        2
      )
    );
    process.exitCode = hard.length ? 1 : 0;
    return;
  }

  console.log("Pronunciation audit — spoken text of every deck");
  if (!(await referenceAvailable())) {
    console.log(
      "(no reference layer: install tools/narration deps for the CMU dictionary — " +
        "everything below is spelling only)"
    );
  }
  for (const result of triaged) report(result);

  if (hard.length) {
    console.log("HARD findings (defects — fix the recipe, not the audio):");
    for (const h of hard) console.log("  ✗ " + h);
  } else {
    console.log("No hard findings: no year leaks, no dead lexicon entries.");
  }

  const queue = triaged.map((t) => ({ deck: t.deck, findings: needsEar(t) }));
  const total = queue.reduce((n, q) => n + q.findings.length, 0);
  if (wantStrips) {
    console.log(`\nRendering audition strips for ${total} word(s)…\n`);
    const { renderStrips, reportPath } = await import("./strips.mjs");
    for (const q of queue) {
      if (!q.findings.length) continue;
      console.log(`[${q.deck}] ${q.findings.length} strip(s)`);
      const out = await renderStrips(
        { deck: q.deck, findings: q.findings },
        { force: argv.includes("--force"), log: (line) => console.log(line) }
      );
      console.log(`  → ${reportPath(out.sheet)} (rendered ${out.rendered}, kept ${out.skipped})\n`);
    }
  } else if (wantWorksheet) {
    const rowsByDeck = triaged
      .map((t) => ({ deck: t.deck, rows: worksheetRows(t) }))
      .filter((d) => d.rows.length);
    const sheet = renderWorksheet(rowsByDeck);
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const outDir = join(dirname(fileURLToPath(import.meta.url)), ".cache");
    mkdirSync(outDir, { recursive: true });
    const path = join(outDir, "worksheet.md");
    writeFileSync(path, sheet);
    const all = rowsByDeck.flatMap((d) => d.rows);
    const open = all.filter((r) => !r.settled);
    console.log(`\nLookup worksheet → ${path}`);
    for (const d of rowsByDeck) {
      const o = d.rows.filter((r) => !r.settled).length;
      console.log(`  ${d.deck}: ${o} open of ${d.rows.length}`);
    }
    console.log(`\n${open.length} open in total. Next: ${open.slice(0, 6).map((r) => r.word).join(", ")}${open.length > 6 ? ", …" : ""}`);
  } else {
    console.log(
      `\nNext: hear the ${total} word(s) above — npm run narration:audit -- --strips` +
        (total ? "" : " (nothing outstanding)")
    );
  }
  process.exitCode = hard.length ? 1 : 0;
}

if (process.argv[1] && process.argv[1].endsWith("audit.mjs")) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 2;
  });
}
