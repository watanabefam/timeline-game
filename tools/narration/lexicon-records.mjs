// The pronunciation record layer — AUTHOR-TIME ONLY. The game NEVER imports
// this file.
//
// WHY THIS EXISTS
// Provenance for pronunciation overrides used to live in prose comments next
// to the entry in text.mjs, where nothing could check it. That is not
// enforcement: an entry with no evidence behind it passed the whole test
// suite. The only test that fired was `textHash` staleness — an objection to
// the AUDIO being out of date, not to the PRONUNCIATION being unevidenced — and
// a routine re-render clears it permanently. This module is the missing half:
// one record per grapheme form, and tests that require it to be complete.
//
// WHAT IS AND IS NOT HERE, AND WHY
// The record does NOT store the alias. `LEXICON` in text.mjs is the single
// definition of the respelling, and it has to live there because AGENTS.md
// makes text.mjs the source of truth for the spoken words and its mirror
// region is what ships to the browser as narration-recipe.js. Copying the
// alias into this file would create a second definition that could disagree
// with the first — the precise "defined twice" failure this layer exists to
// prevent. The key here identifies WHICH lexicon entry is being documented;
// `aliasFor()` reads the one true value.
//
// PHONEME_TARGETS used to live in pronounce.mjs as a parallel map. It is
// absorbed here rather than cross-checked, so each word has one definition
// instead of two plus a test asserting the copies match.
//
// IDENTITY: one record per GRAPHEME FORM, not per event
// A key is a written form, matched case-insensitively (the matcher is /i), so
// two keys differing only in case are the same entry and the second would be
// unreachable — `noCaseCollisions()` enforces that. But "WWII" and "World War
// II" are DIFFERENT keys that both need entries, because the text may contain
// either. That is the W3C Pronunciation Lexicon's own `grapheme` concept, and
// it is the only reading that is true of this data. Note that keys and aliases
// are different namespaces: "World War One" is an alias, never a key.
//
// THE THREE KINDS OF SOURCE — and why there are three
// Not every fix came from looking something up, and forcing them all into one
// shape would mean citing a dictionary for a style decision, which would be a
// lie. The distinctions are real:
//
//   reference   An external authority was consulted. `citation` says which,
//               and then the record must make a FUSS about whether a page
//               was opened: exactly one of `url` or `noUrlBecause` is
//               required, never both and never neither. This exists because
//               `cleisthenes` shipped with the citation "Wiktionary has no
//               entry for this name, so no URL is claimed" — which was false,
//               and unfalsifiable as written. `noUrlBecause` forces the
//               admission that there is nothing to link to, in its own field,
//               where a reader can see it and a test can require it.
//   measurement The evidence is this project's own reference layer: the
//               engine's phonemes compared against a dictionary reading, then
//               confirmed by ear. `note` records what was measured. These are
//               genuine evidence and are not lesser for being self-generated,
//               but they are not citable to anyone else.
//   decision    A choice about WHAT THIS PROJECT SAYS. Never a claim about
//               what a language does. `decisionType` and `decidedBy` are
//               required so it is always visible that this is a preference
//               rather than a fact.
//
// WHERE AN LLM SITS IN THAT HIERARCHY — never as a source
// The obvious hierarchy puts "our own approved list" at the top, and an
// assistant is often the thing that wrote that list. Treating the list as its
// own authority would make the layer self-referential: every record would
// validate against the thing it is evidence for, and the suite would be green
// forever. So the rule is narrow and absolute:
//
//   An LLM may not be the source of a `reference`.
//
// If a reading rests on an assistant's say-so, the record is a `decision` (with
// `decidedBy`) or a `measurement` (only if the engine was actually checked).
// `reference` means a page was opened and it says that. The assistant's job is
// to find the page and read it, which is exactly the false-negative mistake
// documented in §4.7.5: it is fast, confident, and wrong about which headword
// to look up.
//
// DISAGREEMENT IS A RESULT TOO
// `rejected` records the readings that were found and not taken, and why. It is
// optional, and no test can require it — a source that agrees with us needs no
// rebuttal. But a source that DISAGREES and is then quietly dropped is the same
// silent loss as the false citation: the next person redoes the search, and
// this time it may not find the rival. `cleisthenes` has three rival readings
// on record for exactly this reason.
"use strict";

/**
 * The three terminal outcomes of looking a word up.
 *
 * FIXED and CONFIRMED were the plan; DEFERRED was added because the very first
 * pass over a real deck produced a word no respelling could reach, and
 * recording that as a durable outcome is more useful than leaving it in a
 * worksheet nobody reads. A deferred word is not a failure: it is a word we
 * looked up, understood, and could not fix with the tools here, with the
 * reason kept so nobody redoes the work.
 */
export const FIXED = "fixed";
export const CONFIRMED = "confirmed";
export const DEFERRED = "deferred";

/**
 * Why a word could not be fixed. `deferredBecause` says it in prose; this
 * says it in a form you can count and filter on, which is the only reason it
 * is a separate field.
 *
 * `engine-limit` is the one that is about US rather than about the word: the
 * reading is well established and the respelling layer still cannot reach it
 * (an unbroken /tl/ cluster that the engine force-syllabifies). Without it,
 * every deferred word looks like a word nobody knows how to say, which would
 * be a false claim about tenochtitlan.
 */
export const DEFERRED_KINDS = [
  "transliteration",
  "historical-reconstruction",
  "non-standard-form",
  "no-established-pronunciation",
  "engine-limit",
];

/** Statuses that require a LEXICON entry (and therefore a verified phoneme). */
export const FIXED_STATUSES = [FIXED];

/** Valid `source.kind` values. */
export const SOURCE_KINDS = ["reference", "measurement", "decision"];

/** Valid `source.decisionType` values, for `kind: "decision"` only. */
export const DECISION_TYPES = ["style", "editorial", "owner-ratified"];

// IDENTITY OF THE KEY SETS
// Every LEXICON key must have a FIXED record, and every FIXED record must have
// a LEXICON entry — that pairing is what the key-set test checks. CONFIRMED and
// DEFERRED records deliberately have no LEXICON entry: the engine already says
// those words correctly, or no respelling could reach them, so there is nothing
// to override. That is why the three statuses exist rather than two: without
// DEFERRED, a word we investigated and could not fix would have nowhere to live
// except a worksheet nobody reads, and the next person would start from zero.
/**
 * One record per LEXICON key. Keys must match LEXICON exactly (case included);
 * `keySetsAgree()` is the test that keeps them honest.
 */
export const RECORDS = new Map([
  [
    "theses",
    {
      phoneme: "θˈiːsiːz",
      status: FIXED,
      reason: "borrowed-name pronunciation: the engine gave the wrong vowel and the wrong stress",
      source: {
        kind: "reference",
        citation: "OALD, first-syllable stress (recorded in the LEXICON note); machine-checked against the engine's own phonemizer",
        noUrlBecause: "the OALD was consulted as a printed work; no online page was opened for this reading, so there is nothing to link to",
        date: "2026-09-30",
      },
    },
  ],
  [
    "medina",
    {
      phoneme: "mˈʌdˈiːnə",
      status: FIXED,
      reason: "borrowed-name pronunciation: stress belongs on the second syllable, not the first",
      source: {
        kind: "measurement",
        note: "reference layer measured engine stress on syllable 1 against CMUdict M AH0 D AY1 N AH0 (syllable 2); the audition pass confirmed muh-DEE-nuh",
        date: "2026-09-30",
      },
    },
  ],
  [
    "aotearoa",
    {
      phoneme: "ˈaʊtˈiːæɹˈoʊə",
      status: FIXED,
      reason: "borrowed-name pronunciation: five syllables, which the plain spelling collapses into four",
      source: {
        kind: "measurement",
        note: "audition sheet against the Maori name a-o-te-a-roa; four rejected respellings are recorded in the LEXICON note",
        date: "2026-09-30",
      },
    },
  ],
  [
    "hijra",
    {
      phoneme: "hˈɪdʒɹˈɑː",
      status: FIXED,
      reason: "borrowed-name pronunciation: the j must survive as /dʒ/ and stress leads",
      source: {
        kind: "reference",
        citation: "period dictionary, Hijra (hij'ra), and the Arabic hijrah it transliterates; the j is lost entirely in the engine's plain reading",
        noUrlBecause: "the period dictionary entry was consulted from print; no online page was opened for this reading",
        date: "2026-09-30",
      },
    },
  ],
  [
    "World War I",
    {
      phoneme: "wˈɜːld wˈɔːɹ wˌʌn",
      status: FIXED,
      reason: "the engine read the numeral as a letter; we say the war's number in words",
      source: {
        kind: "decision",
        decisionType: "style",
        decidedBy: "project owner",
        date: "2026-09-30",
      },
    },
  ],
  [
    "World War II",
    {
      phoneme: "wˈɜːld wˈɔːɹ tˈuː",
      status: FIXED,
      reason: "the engine read the Roman numeral as an ordinal ('World War ROMAN TWO')",
      source: {
        kind: "decision",
        decisionType: "style",
        decidedBy: "project owner",
        date: "2026-09-30",
      },
    },
  ],
  [
    "WWII",
    {
      phoneme: "dˌʌbəljˌuːdˈʌbəljˌuː tˈuː",
      status: FIXED,
      reason: "same defect as World War II: separating the numeral from the word restores the lost syllable boundary",
      source: {
        kind: "decision",
        decisionType: "style",
        decidedBy: "project owner",
        date: "2026-09-30",
      },
    },
  ],
  // The 2026-09-30 backlog pass over world-history-first-timeline. Fifteen of
  // the deck's sixteen no-reference words reached a terminal outcome: seven
  // fixed, seven confirmed already correct, one deferred. Tenochtitlan is the
  // interesting one — see its record.
  [
    "babur",
    {
      phoneme: "bˈɑːbˈoːɹ",
      status: FIXED,
      reason: "borrowed-name pronunciation: the engine read BAB-er, wrong vowel in both syllables",
      source: {
        kind: "reference",
        citation: "standard English historical usage of Babur, the Timurid founder, from the Chagatai form Babur",
        noUrlBecause: "this is the ordinary English historical reading and no single dictionary page was opened for it",
        date: "2026-09-30",
      },
    },
  ],
  [
    "cleisthenes",
    {
      phoneme: "klˈaɪzθˈɪnˈiːz",
      status: FIXED,
      reason:
        "borrowed-name pronunciation: the /sθ/ cluster is not how the name is said, " +
        "and the second vowel is /ɪ/ (\"thin\"), not /iː/ (\"teen\")",
      source: {
        kind: "reference",
        citation:
          "English Wikipedia's lead, {{IPAc-en|ˈ|k|l|aɪ|s|θ|ᵻ|n|iː|z}} with " +
          "{{respell|KLYS|thin|eez}} — a hand-maintained {{IPAc-}} field, so this is " +
          "the encyclopedia's house convention rather than a recording. Native " +
          "Wiktionary (https://en.wiktionary.org/wiki/Κλεισθένης) has no entry " +
          "under the English headword, which is what an English-only lookup finds",
        url: "https://en.wikipedia.org/wiki/Cleisthenes",
        rejected: [
          {
            reading: "klysse-thin-eez",
            from: "English Wikipedia's {{respell}} for Cleisthenes son of Sibyrtius",
            why: "a second hand-maintained respelling on a different article, differing only in the first cluster; the /aɪ/ article is the more consistently maintained one",
          },
          {
            reading: "klisˈθe.nis (kli-THEN-is)",
            from: "Wiktionary's Descendants block, from the living modern Greek name",
            why: "a real and defensible reading, but it is the modern Greek name's pronunciation, not the anglicised one an English reader of a history meets",
          },
          {
            reading: "kly-stee-neez /klˈaɪstˈiːnˈiːz/",
            from: "an earlier attempt in this project, 2026-09-30",
            why: "no source supports it: the second vowel is /ɪ/, not /iː/. Kept here because it shipped, and a correction nobody can trace is a correction nobody can check",
          },
        ],
        date: "2026-09-30",
      },
    },
  ],
  [
    "mexica",
    {
      phoneme: "mˈɛsˈiːkˈɑː",
      status: FIXED,
      reason: "borrowed-name pronunciation: meh-SEE-ka, not MEK-si-kuh; the /k/ is not in the name",
      source: {
        kind: "reference",
        citation: "Nahuatl Mēxihco, anglicised meh-SEE-ka, as used in the Mexica/Aztec terminology debate",
        noUrlBecause: "the reading follows the ordinary anglicised form used in the terminology debate; no single page was opened for it",
        date: "2026-09-30",
      },
    },
  ],
  [
    "mughal",
    {
      phoneme: "mˈuːɡˈʌl",
      status: FIXED,
      reason: "borrowed-name pronunciation: the dynasty is Persian mugūl, MOO-gul, not the mogul of the business sense",
      source: {
        kind: "reference",
        citation: "Wiktionary's Moghul entry gives the Persian etymology mugūl / moġol; the dynasty reading follows the former",
        url: "https://en.wiktionary.org/wiki/Moghul",
        date: "2026-09-30",
      },
    },
  ],
  [
    "odoacer",
    {
      phoneme: "ˈoʊdoʊˈaɪsˈɜː",
      status: FIXED,
      reason: "borrowed-name pronunciation: the engine dropped the /eɪ/ of -acer entirely and stressed the wrong syllable",
      source: {
        kind: "reference",
        citation: "Wiktionary: UK /ˌɒdəʊˈeɪsə/, US /ˌoʊdoʊˈeɪsər/ — both stress the final syllable",
        url: "https://en.wiktionary.org/wiki/Odoacer",
        date: "2026-09-30",
      },
    },
  ],
  [
    "mansa",
    {
      phoneme: "mˈænsˈuː",
      status: FIXED,
      reason: "borrowed-name pronunciation: MAN-soo, from Arabic manṣūf via Mandinka; the engine's MAN-suh drops the long vowel",
      source: {
        kind: "reference",
        citation: "standard English rendering of Mansa Musa",
        noUrlBecause: "the rendering is the ordinary English one and no dictionary page was opened for it",
        date: "2026-09-30",
      },
    },
  ],
  [
    "principate",
    {
      phoneme: "pɹˈɪnsˈʌpˈʊt",
      status: FIXED,
      reason: "borrowed-name pronunciation: the ending is /ət/ (put), not /eɪt/ (pate)",
      source: {
        kind: "reference",
        citation: "standard English rendering in Roman histories; the Latin principatus gives /ˈprɪnsɪpət/",
        noUrlBecause: "the reading follows ordinary English usage and the Latin form; no page was opened for it",
        date: "2026-09-30",
      },
    },
  ],
  // ---- confirmed: the engine was already right, and saying so is the result
  [
    "taíno",
    {
      status: CONFIRMED,
      reason: "audited and confirmed correct: the engine's tˈeɪnoʊ is TAY-no, and WikiPron independently reads it the same way",
      source: { kind: "measurement", note: "engine output checked against the WikiPron reading tInO; the two agree", date: "2026-09-30" },
    },
  ],
  [
    "analects",
    {
      status: CONFIRMED,
      reason: "audited and confirmed correct: ˈæneɪləkts is a defensible English reading of a Chinese title",
      source: { kind: "measurement", note: "ordinary English loanword reading; no override improves on it", date: "2026-09-30" },
    },
  ],
  [
    "deposes",
    {
      status: CONFIRMED,
      reason: "audited and confirmed correct: dᵻpˈoʊzᵻz is right for the verb; it was only queued because a card title capitalises it",
      source: { kind: "measurement", note: "spurious queue entry from title capitalisation, not a pronunciation problem", date: "2026-09-30" },
    },
  ],
  [
    "founds",
    {
      status: CONFIRMED,
      reason: "audited and confirmed correct: fˈaʊndz is right for the verb; queued only as a title-capitalised word",
      source: { kind: "measurement", note: "spurious queue entry from title capitalisation, not a pronunciation problem", date: "2026-09-30" },
    },
  ],
  [
    "polynesians",
    {
      status: CONFIRMED,
      reason: "audited and confirmed correct: pˌɑːlɪnˈiːʒənz matches the standard reading",
      source: { kind: "measurement", note: "engine output matches the ordinary English reading of the demonym", date: "2026-09-30" },
    },
  ],
  [
    "unifies",
    {
      status: CONFIRMED,
      reason: "audited and confirmed correct: jˈuːnɪfˌaɪz is the standard reading; queued only as a title-capitalised word",
      source: { kind: "measurement", note: "spurious queue entry from title capitalisation, not a pronunciation problem", date: "2026-09-30" },
    },
  ],
  [
    "ottomans",
    {
      status: CONFIRMED,
      reason: "audited and confirmed correct: ˈɑːɾəmənz is a defensible reading; the only 'improvement' found was marginal and not worth shipping",
      source: { kind: "measurement", note: "ot-uh-mans was tried and gave ˈɑːtˈʌmˈænz — a marginal gain that did not justify an override", date: "2026-09-30" },
    },
  ],
  [
    "british-drawn",
    {
      status: CONFIRMED,
      reason: "audited and confirmed correct: not a pronunciation problem at all — a compound of two known words across a hyphen",
      source: { kind: "measurement", note: "false positive from the compound heuristic; both elements are in the dictionary", date: "2026-09-30" },
    },
  ],
  // ---- deferred: investigated, understood, and out of reach of a respelling
  [
    "tenochtitlan",
    {
      status: DEFERRED,
      deferredKind: "engine-limit",
      reason: "no ASCII respelling can reach the five-syllable reading; the mechanism cannot produce it",
      deferredBecause:
        "The standard English reading is teh-NOCH-tee-TLAHN, five syllables with the /tl/ cluster intact. " +
        "The engine force-syllabifies /tl/ as /t.l/ in every candidate tried (teh-noch-tee-tlahn, teh-noch-tee-lahn, " +
        "teh-noch-tee-clahn, ten-och-tee-tlahn), each yielding six syllables with a doubled tee. A respelling " +
        "cannot express an unbroken /tl/ cluster, so this is out of reach of the LEXICON layer entirely — the same " +
        "wall as Raskolnikov's stress. It would need the IPA layer that was dropped, or a different alias " +
        "strategy. Recorded so the investigation is not repeated.",
      source: { kind: "measurement", note: "ten candidate respellings tested against the engine's phonemizer; all produced a spurious syllable", date: "2026-09-30" },
    },
  ],
  [
    "bastille",
    {
      phoneme: "bˈæstˈiːl",
      status: FIXED,
      reason: "borrowed-name pronunciation: both OED and Wiktionary put stress on the SECOND syllable, which CMUdict and the engine both get wrong; RP chosen over GA to keep the -i:l/ rhyme audible",
      source: {
        kind: "reference",
        citation: "Wiktionary citing the OED: General American /baestil/, Received Pronunciation /baesti:l/, both second-syllable stress",
        url: "https://en.wiktionary.org/wiki/Bastille",
        date: "2026-09-30",
      },
    },
  ],
]);

/** Keys present in both maps, uppercased for the case-collision check. */
export function recordKeys() {
  return [...RECORDS.keys()];
}

/** True when `kind` is one this project recognises. */
export function validSourceKind(kind) {
  return SOURCE_KINDS.includes(kind);
}

/** True when `type` is a recognised decision type. */
export function validDecisionType(type) {
  return DECISION_TYPES.includes(type);
}

/** True when `kind` is a recognised reason a word could not be fixed. */
export function validDeferredKind(kind) {
  return DEFERRED_KINDS.includes(kind);
}

/**
 * Validate an optional `rejected` list: the readings that were found and not
 * taken. Shape only — nothing here can tell whether the reasons are any good,
 * only whether a rival reading was recorded as a rival reading.
 */
export function rejectedListIsWellFormed(list) {
  if (list == null) return true;
  if (!Array.isArray(list) || list.length === 0) return false;
  return list.every(
    (r) =>
      r &&
      typeof r.reading === "string" &&
      r.reading.trim().length > 0 &&
      typeof r.why === "string" &&
      r.why.trim().length > 20
  );
}

/**
 * Every `url` in the record layer, for the link-check.
 *
 * Kept as a function rather than a constant so a caller cannot hold a stale
 * snapshot if RECORDS is ever mutated in a test.
 */
export function recordUrls() {
  const out = [];
  for (const [word, r] of RECORDS) {
    if (r.source?.url) out.push({ word, url: r.source.url });
  }
  return out;
}
