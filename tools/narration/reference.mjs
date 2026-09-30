// The reference layer of the pronunciation QA system — AUTHOR-TIME ONLY.
//
// Spelling can GUESS that a word is risky, but guessing produces false
// positives: "australia" looks exactly as exotic on the page as
// "tenochtitlan", and only one of them is a problem. This module replaces
// the guess with a measurement. The CMU Pronouncing Dictionary (ISC
// licence, author-time devDependency, 135k entries) carries a reference
// pronunciation for ordinary English, and comparing it with the engine's
// own phonemes sorts every candidate into one of three states:
//
//   agrees        the engine already says what the dictionary says — no ear
//                 time, no override, done. This is what shrinks the list.
//   disagrees     the engine puts the stress or the stressed vowel somewhere
//                 else. An actionable finding, and exactly what a LEXICON
//                 respelling can fix.
//   no-reference  the dictionary has never heard of the word. No offline
//                 lexicon can settle it, only a human: the Sundiatas and
//                 Tenochtitlans of the corpus. This is the recall side of
//                 the audit — a name nobody checked is a name nobody heard.
//
// The comparison is deliberately COARSE: stress position plus the class of
// the stressed vowel. An exact phoneme diff would flag every legitimate
// accent variant in the corpus ("paranoia" vs "lives" vs "read"); a
// coarse diff still catches the failure that matters — "theses" comes out
// of the engine as θəsˈiːz, and no English speaker says it that way.
//
// Both dependencies are optional. Without the dictionary, or without the
// phonemizer, `referenceAvailable()` is false and every caller falls back
// to the bare-word behaviour it had before.
//
// A THIRD reading — WikiPron, Apache-2.0, human broad transcription — is
// attached when present as `second`. It exists to expose the failure CMUdict
// structurally cannot show: a BORROWED name, where the dictionary has
// recorded the English reading of the letters and the engine faithfully
// reproduced it, so the two agree and the audit says "verified" while the
// dynasty comes out as "kin". "qin" is the worked example. It is advice for
// a human and never moves the tier — see `tidyIpaReading` for the measured
// reason why an automatic cross-notation verdict had to be removed.
"use strict";

import { phonemizerAvailable, wordPhonemes } from "./pronounce.mjs";
import { wikipronForms } from "./wikipron.mjs";

/** The three states a candidate word can be in. */
export const AGREES = "agrees";
export const DISAGREES = "disagrees";
export const NO_REFERENCE = "no-reference";

/** Order matters: this is the listening queue, worst news first. */
export const TIER_ORDER = [DISAGREES, NO_REFERENCE, AGREES];

let dict;
let pending; // the in-flight probe, so concurrent callers share one result

/**
 * True when both the phonemizer and the reference dictionary are usable.
 * Memoised on the PROMISE, not on a boolean: the audit triages every deck
 * concurrently, and a boolean flag flipped before the import settles hands
 * the second caller `undefined`.
 */
export function referenceAvailable() {
  if (!pending) pending = probe();
  return pending;
}

async function probe() {
  try {
    const mod = await import("cmu-pronouncing-dictionary");
    const table = mod.dictionary ?? mod.default?.dictionary;
    if (table && Object.keys(table).length > 1000) dict = table;
  } catch {
    dict = null; // devDependency not installed — callers fall back, never crash
  }
  if (dict != null) return phonemizerAvailable();
  return false;
}

/**
 * The dictionary's key for a word: lowercased, without the corpus's
 * trailing typographic apostrophes ("aristophanes’" and "aristophanes" are
 * one word, and reporting them twice would be the audit's own noise).
 */
export function normaliseKey(word) {
  return String(word || "")
    .toLowerCase()
    .replace(/[’']s?$/, "")
    .replace(/[-–]$/, "")
    .trim();
}

/**
 * CMUdict is an AMERICAN dictionary and this corpus is written in British
 * English, plus a few compounds. Rather than let every "standardised" land
 * in "needs a human source", try the handful of spellings that make no
 * difference to how the word is said.
 */
const DICT_VARIANTS = [
  (k) => k,
  (k) => (k.includes("-") ? k.split("-")[0] : null), // "british-drawn" → "british"
  (k) => k.replace(/ised$/, "ized"),
  (k) => k.replace(/ising$/, "izing"),
  (k) => k.replace(/isation$/, "ization"),
  (k) => k.replace(/ise$/, "ize"),
  (k) => k.replace(/yse$/, "yze"),
  (k) => k.replace(/our$/, "or"),
];

/**
 * Reference pronunciations for a word, as ARPAbet strings ([] if unknown).
 * @returns {string[]}
 */
export function dictionaryForms(word) {
  if (!dict) return [];
  const key = normaliseKey(word);
  for (const variant of DICT_VARIANTS) {
    const form = variant(key);
    if (!form) continue;
    const entry = dict[form];
    if (entry) {
      return String(entry)
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

/** The spelling variant the dictionary lookup actually hit, or null. */
export function dictionaryVariant(word) {
  if (!dict) return null;
  const key = normaliseKey(word);
  for (const variant of DICT_VARIANTS) {
    const form = variant(key);
    if (form && dict[form]) return form;
  }
  return null;
}

/* ---------------------------------------------------------------- vowels */

/**
 * The phone inventory eSpeak emits, longest first — it is greedy-matched so
 * "tʃ" is one phone and "θəsˈiːz" splits into six. Anything the inventory
 * does not know is treated as a consonant, which is the safe direction:
 * a missed nucleus costs a stress position, a false one invents a syllable.
 */
const PHONES = [
  "tʃ","dʒ","aɪ","aʊ","ɔɪ","oʊ","əʊ","eɪ","ɪə","eə","ʊə","ɔə","ɪɚ","eɚ",
  "iː","uː","ɛː","ɔː","ɑː","ɜː","ɐː","ᵻ",
  "p","b","t","d","k","g","f","v","s","z","h","m","n","l","r","ɹ","ɻ","w","j",
  "ɫ","ʔ","ɾ","ʕ","θ","ð","ʃ","ʒ","ŋ","x","ç","ɣ","ʁ","ʰ",
  "i","ɪ","e","ɛ","æ","a","ɑ","ɒ","ɔ","o","ʊ","u","ʉ","ʌ","ə","ɚ","ɜ","ɘ","ɐ","ɵ","ʏ",
].sort((a, b) => b.length - a.length);

/** eSpeak phone → coarse vowel class (null = a consonant). */
const IPA_CLASS = new Map([
  ["aɪ", "front-glide"], ["ɔɪ", "front-glide"], ["oɪ", "front-glide"],
  ["aʊ", "back-glide"], ["ɔʊ", "back-glide"], ["oʊ", "back-glide"], ["əʊ", "back-glide"],
  ["eɪ", "front-mid-glide"],
  ["ɪə", "centring"], ["eə", "centring"], ["ʊə", "centring"], ["ɔə", "centring"],
  ["ɪɚ", "centring"], ["eɚ", "centring"], ["ɚ", "centring"], ["ɜ", "centring"], ["ɜː", "centring"],
  ["i", "close-front"], ["iː", "close-front"], ["ɪ", "close-front"], ["ᵻ", "close-front"], ["ʏ", "close-front"],
  ["e", "front"], ["ɛ", "front"], ["ɛː", "front"], ["æ", "front"],
  ["a", "back"], ["ɑ", "back"], ["ɑː", "back"], ["ɐ", "back"], ["ɐː", "back"],
  ["ɔ", "back"], ["ɔː", "back"], ["o", "back"],
  ["ʌ", "central"], ["ə", "central"], ["ɘ", "central"], ["ɵ", "central"],
  ["u", "close-back"], ["uː", "close-back"], ["ʊ", "close-back"], ["ʉ", "close-back"],
]);

/** ARPAbet vowel → the same coarse classes, so the two can be compared. */
const ARPA_CLASS = new Map([
  ["IY", "close-front"],
  ["IH", "close-front"],
  ["EY", "front-mid-glide"],
  ["EH", "front"],
  ["AE", "front"],
  ["AA", "back"],
  ["AO", "back"],
  ["AH", "central"],
  ["AX", "central"],
  ["ER", "centring"],
  ["UH", "close-back"],
  ["UW", "close-back"],
  ["AY", "front-glide"],
  ["AW", "back-glide"],
  ["OW", "back-glide"],
  ["OY", "front-glide"],
]);

/** Split an eSpeak phoneme string into stress markers and phones. */
export function tokenizeIpa(ipa) {
  const s = String(ipa || "");
  const out = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "ˈ" || ch === "ˌ") {
      out.push({ mark: ch });
      i += 1;
      continue;
    }
    const phone = PHONES.find((p) => s.startsWith(p, i));
    out.push({ phone: phone ?? ch });
    i += phone ? phone.length : 1;
  }
  return out;
}

/** Coarse vowel class of one eSpeak phone, or null if it is a consonant. */
export function vowelClassIpa(phone) {
  return IPA_CLASS.get(String(phone || "")) ?? null;
}

/** Coarse vowel class of an ARPAbet vowel, or null. */
export function vowelClassArpa(token) {
  return ARPA_CLASS.get(String(token || "").replace(/[0-9]/g, "").toUpperCase()) ?? null;
}

/**
 * Stress position and stressed-vowel class of an eSpeak phoneme string.
 * @returns {{ stress: number|null, vowel: string|null }}
 */
export function profileIpa(ipa) {
  const nuclei = [];
  let stress = null;
  let primary = false;
  for (const token of tokenizeIpa(ipa)) {
    if (token.mark === "ˈ") {
      primary = true;
      continue;
    }
    if (token.mark) continue; // secondary stress does not move the nucleus
    const cls = vowelClassIpa(token.phone);
    if (cls) {
      nuclei.push(cls);
      if (primary) stress = nuclei.length;
      primary = false;
    }
  }
  if (!nuclei.length) return { stress: null, vowel: null };
  // No primary marker (a monosyllable, or a flat marking): the stressed
  // vowel is the only one there is.
  return { stress: stress ?? 1, vowel: nuclei[stress != null ? stress - 1 : 0] };
}

/**
 * Stress position and stressed-vowel class of an ARPAbet pronunciation.
 * @returns {{ stress: number|null, vowel: string|null }}
 */
export function profileArpa(arpa) {
  const phones = String(arpa || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let count = 0;
  let stress = null;
  let vowel = null;
  let first = null;
  for (const phone of phones) {
    const cls = vowelClassArpa(phone);
    if (!cls) continue; // a consonant, or a stress mark on its own
    count += 1;
    if (first == null) first = cls;
    if (/1$/.test(phone)) {
      stress = count;
      vowel = cls;
    }
  }
  // An entry with no stress digits at all and one vowel is a monosyllable:
  // that vowel is the stressed one.
  if (stress == null && count === 1) {
    stress = 1;
    vowel = first;
  }
  return { stress, vowel };
}

/* ------------------------------------------- second reference (WikiPron) */

// WikiPron writes tie bars (t͡ʃ), length marks (ː) and syllabic diacritics
// (l̩); ARPAbet writes stress digits. Strip the marks that carry no phonetic
// contrast for a coarse comparison and keep the phones.

/**
 * A WikiPron reading, tidied for printing beside the engine's phonemes.
 *
 * WikiPron writes tie bars (t͡ʃ), length marks (ː) and syllabic diacritics
 * (l̩). They carry real phonetic information, so they are left alone; only
 * the spacing is normalised, because the raw TSV is inconsistently padded.
 *
 * There is deliberately NO code here that compares a WikiPron reading against
 * a CMUdict one and renders a verdict. An earlier version did, positionally,
 * and measurement killed it: over real words it reported "world"
 * (W ER1 L D against "w ɜ ɹ l d"), "empire", "napoleon" and "athens" as
 * contested. The reason is structural. ARPAbet writes an r-coloured vowel as
 * ONE phone (ER, AY R) where IPA writes TWO (ɜ ɹ, aɪ ɚ), so the sequences
 * are not index-aligned and any position-wise difference is an artefact. The
 * two vowel classifiers also name their classes differently ("front" versus
 * "close-front"), so even a length-matched pair drifts apart on naming.
 * Aligning them properly needs a real aligner, and until one exists a
 * machine verdict here would be confidently wrong on the commonest words in
 * English. The reading is shown to a human; BORROWED_NAMES in audit.mjs is
 * the curated route to the ear. See doc/LIBRARY_RESEARCH.md §4.7.
 */
export function tidyIpaReading(reading) {
  return String(reading || "").trim().split(/\s+/).join(" ");
}

/* -------------------------------------------------------------- classify */

/**
 * Sort one candidate word into a tier, with the evidence to print.
 *
 * @param {string} word  as SPOKEN (i.e. after the LEXICON respellings)
 * @returns {Promise<{ word: string, key: string, tier: string,
 *   engine: string|null, dict: string|null, note: string,
 *   second?: string }>}  `second` is a WikiPron reading shown for a human to
 *   weigh; it never influences `tier` (see tidyIpaReading for why).
 */
export async function classify(word) {
  const key = normaliseKey(word);
  const out = { word, key, tier: NO_REFERENCE, engine: null, dict: null, note: "" };
  if (!(await referenceAvailable())) {
    out.tier = null; // caller keeps its spelling-only behaviour
    out.note = "reference layer unavailable";
    return out;
  }
  out.engine = await wordPhonemes(word);
  const forms = dictionaryForms(key);
  if (!forms.length) {
    out.note = "no dictionary entry — nothing but the ear can settle this";
    return out;
  }
  out.dict = forms[0];
  const via = dictionaryVariant(key);
  const viaNote = via && via !== key ? ` (looked up "${via}")` : "";
  // A compound ("star-spangled", "england-france") has no entry of its own,
  // and comparing it with its first element invents a disagreement that is
  // really just a gap. The compound goes to the ear instead, honestly
  // labelled as one.
  const head = key.includes("-") ? key.split("-")[0] : null;
  if (head && via === head) {
    out.tier = NO_REFERENCE;
    out.note = "compound — the dictionary has its parts, not the whole";
    return out;
  }

  const mine = profileIpa(out.engine);
  let best = null;
  for (const form of forms) {
    const theirs = profileArpa(form);
    const stressDiff = mine.stress != null && theirs.stress != null && mine.stress !== theirs.stress;
    const vowelDiff = mine.vowel && theirs.vowel && mine.vowel !== theirs.vowel;
    if (!stressDiff && !vowelDiff) {
      best = { tier: AGREES, note: "engine agrees with the dictionary" };
      break;
    }
    // The dictionary ships several readings for many words; a mismatch
    // against ANY of them is not a finding.
    best = {
      tier: DISAGREES,
      note: [
        stressDiff ? `stress on syllable ${mine.stress}, dictionary ${theirs.stress}` : "",
        vowelDiff ? `stressed vowel /${mine.vowel}/, dictionary /${theirs.vowel}/` : "",
      ]
        .filter(Boolean)
        .join("; "),
      form,
    };
  }
  out.tier = best.tier;
  out.note = `${best.note}${viaNote}`;

  // A second, independently sourced reading, attached as ADVICE ONLY.
  //
  // This is the only offline signal for the failure CMUdict cannot show: a
  // BORROWED name, where the dictionary has recorded the English reading of
  // the letters and the engine faithfully reproduced it, so both agree and
  // the audit calls it verified. "qin" is the worked example — K IH1 N against
  // t͡ʃ ɪ n. Surfacing WikiPron beside it is genuinely useful.
  //
  // It deliberately does NOT change the tier. An earlier version demoted
  // AGREES to DISAGREES on a phone mismatch, and measurement killed it: over
  // real words it flagged "world" (W ER1 L D against "w ɜ ɹ l d"), "empire",
  // "napoleon" and "athens" — the comparison is positional, and the two
  // notations segment differently. ARPAbet writes an r-coloured vowel as one
  // phone (ER) where IPA writes two (ɜ ɹ), so the sequences are not
  // index-aligned; the two vowel classifiers also name their classes
  // differently ("front" vs "close-front"). Positional comparison across
  // notations with different segmentation is not a sound basis for an
  // automatic verdict, and a false "world is contested" would send every
  // common word in the deck to the ear. See doc/LIBRARY_RESEARCH.md §4.7.
  //
  // The reading is shown, never obeyed. A human weighs it; BORROWED_NAMES in
  // audit.mjs remains the curated route to the ear for this class.
  const wp = await wikipronForms(key);
  if (wp.length) out.second = tidyIpaReading(wp[0]);

  if (best.form) out.dict = best.form;
  return out;
}
