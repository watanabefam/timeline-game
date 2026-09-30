// Guard rails for the audit's reference layer and its four tiers.
//
// The listening pass is a human job; what a test can do is make sure the
// machine's half keeps its promises:
//   • the comparison finds the known-bad word ("theses") and spares the
//     merely unusual ones ("australia", "school");
//   • a word nobody has a source for is never silently skipped;
//   • every candidate ends up in a tier, so the list cannot quietly rot;
//   • the probe is memoised on the promise, not a boolean — the audit
//     triages decks concurrently and a race here made every finding
//     "unverified" while the header claimed the dictionary was present;
//   • the CLASS is covered, not just today's instance: an unfamiliar name in
//     a fact, in a title only, or spelled with a macron is always queued —
//     and the one case that ISN'T (a name the dictionary anglicises) is
//     asserted too, so the gap stays visible instead of being forgotten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { AGREES, DISAGREES, NO_REFERENCE, classify, profileArpa, profileIpa, referenceAvailable } from "../reference.mjs";
import { CONTEXT, TIERS, UNVERIFIED, analyseEvent, borrowedNames, needsEar, triage, triageAll } from "../audit.mjs";
import { stripScript } from "../strips.mjs";
import { phonemesFor } from "../pronounce.mjs";

const available = await referenceAvailable();
const skip = available ? false : "reference layer not installed (npm --prefix tools/narration install)";

test("stress and vowel profiles read both notations the same way", () => {
  // The failure this system exists for: the engine says thuh-SEEZ, the
  // dictionary says THEE-seez — different stressed syllable.
  assert.deepEqual(profileIpa("θəsˈiːz"), { stress: 2, vowel: "close-front" });
  assert.deepEqual(profileArpa("TH IY1 S IY0 Z"), { stress: 1, vowel: "close-front" });
  // A word eSpeak already gets right must land on the dictionary's answer.
  assert.equal(profileIpa("ɔːstɹˈeɪliə").stress, profileArpa("AO0 S T R EY1 L Y AH0").stress);
});

test("the known-bad word is measured as bad", { skip }, async () => {
  const result = await classify("theses");
  assert.equal(result.tier, DISAGREES);
  assert.match(result.note, /stress on syllable 2/);
});

test("unusual-looking words the engine gets right are not flagged", { skip }, async () => {
  for (const word of ["australia", "school", "qin", "khan", "constantinople"]) {
    assert.equal((await classify(word)).tier, AGREES, `"${word}" was flagged but the engine agrees with the dictionary`);
  }
});

test("a word with no dictionary entry is reported, never skipped", { skip }, async () => {
  const result = await classify("tenochtitlan");
  assert.equal(result.tier, NO_REFERENCE);
  assert.match(result.note, /no dictionary entry/);
});

test("a compound is compared with nothing rather than with its first half", { skip }, async () => {
  // "british-drawn" has no entry; measuring it against "british" invents a
  // stress disagreement that means nothing.
  assert.equal((await classify("british-drawn")).tier, NO_REFERENCE);
});

test("British spellings are not mistaken for unknown words", { skip }, async () => {
  // CMUdict is American. Without the spelling fallback every "standardised"
  // in the corpus would queue for a human.
  assert.equal((await classify("standardised")).tier, AGREES);
});

test("the reference probe is memoised on the promise, not a boolean", async () => {
  const fresh = await Promise.all([referenceAvailable(), referenceAvailable(), referenceAvailable()]);
  assert.deepEqual(fresh, [available, available, available]);
});

test("every deck's candidates land in a tier", { skip }, async () => {
  const known = new Set([...TIERS, CONTEXT, UNVERIFIED]);
  for (const deck of await triageAll()) {
    for (const finding of deck.findings) {
      assert.ok(known.has(finding.tier), `${deck.deck}/${finding.word}: tier "${finding.tier}" is not one we report`);
      assert.ok(finding.word && finding.word === finding.word.toLowerCase(), "findings are keyed by lowercase word");
    }
    const total = Object.values(deck.counts).reduce((n, c) => n + c, 0);
    assert.equal(total, deck.findings.length, `${deck.deck}: the tier counts do not add up`);
  }
});

test("proper nouns reach the audit at all", { skip }, async () => {
  // The recall check only works if names are candidates: "sundiata" has
  // nothing risky about its spelling, so nothing but the name scan finds it.
  const deck = (await triageAll()).find((d) => d.findings.some((f) => f.word === "tenochtitlan"));
  assert.ok(deck, "no deck reports tenochtitlan — the proper-noun scan has regressed");
  const finding = deck.findings.find((f) => f.word === "tenochtitlan");
  assert.ok(finding.name, "tenochtitlan should be marked as a name");
  assert.equal(finding.tier, NO_REFERENCE, "a name with no dictionary entry must ask for a human source");
});

test("a homograph is heard in its own sentence", { skip }, async () => {
  const deck = (await triageAll()).find((d) => d.findings.some((f) => f.tier === CONTEXT));
  if (!deck) return; // no homograph in the corpus: nothing to assert
  for (const finding of deck.findings.filter((f) => f.tier === CONTEXT)) {
    assert.ok(finding.context.length > finding.word.length, `"${finding.word}" has no sentence to audition in`);
    assert.ok(
      stripScript(finding).length > finding.word.length,
      `stripScript should speak the whole sentence for the homograph "${finding.word}"`
    );
  }
});

test("every word queued for the ear has something to play", { skip }, async () => {
  for (const deck of await triageAll()) {
    for (const finding of needsEar(deck)) {
      assert.ok(stripScript(finding).trim().length > 0, `${deck.deck}/${finding.word}: nothing to synthesise`);
    }
  }
});

test("the verified tier is the bulk of the list", { skip }, async () => {
  // If this inverts, the comparison has become noise and the ear will
  // start ignoring the sheet.
  for (const deck of await triageAll()) {
    if (deck.findings.length < 10) continue;
    assert.ok(
      deck.counts[AGREES] > Object.values(deck.counts).reduce((n, c) => n + c, 0) / 2,
      `${deck.deck}: only ${deck.counts[AGREES]}/${deck.findings.length} candidates were verified — the screen is not screening`
    );
  }
});

/* ------------------------------------------------------- the class, not the instance */

/**
 * A synthetic deck, so the "will the next unfamiliar name be caught?"
 * question has an answer that is a test rather than a promise.
 */
const fakeDeck = (event) => ({
  deck: "synthetic",
  cardCount: 1,
  events: [analyseEvent(event)],
  source: "",
});

const tiersOf = async (event) => {
  const { findings } = await triage(fakeDeck(event));
  return new Map(findings.map((f) => [f.word, f.tier]));
};

const DECKS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "decks");
const deckRawText = () =>
  readdirSync(DECKS_DIR)
    .filter((name) => existsSync(join(DECKS_DIR, name, "deck.json")))
    .map((name) => readFileSync(join(DECKS_DIR, name, "deck.json"), "utf8"))
    .join(" ")
    .toLowerCase();

test("an unfamiliar name in a FACT is queued for the ear", { skip }, async () => {
  const tiers = await tiersOf({
    id: "synthetic-1",
    title: "An Event",
    fact: "The voyage of Whakatoa crossed the Pacific long before any map recorded it.",
  });
  assert.equal(tiers.get("whakatoa"), NO_REFERENCE, "a Maori name in a fact was not queued");
});

test("a name at the START of a sentence is queued for the ear", { skip }, async () => {
  const tiers = await tiersOf({
    id: "synthetic-2b",
    title: "An Event",
    fact: "Tamatea commanded the double canoe across the horizon.",
  });
  assert.equal(tiers.get("tamatea"), NO_REFERENCE, "a sentence-initial name was not queued");
});

test("a BORROWED name the dictionary already knows is still queued", { skip }, async () => {
  // The case the dictionary hides. "Constantinople" is in CMUdict
  // (K AA2 N S T AE0 N T AH0 N OW1 P AH0 L) and appears only in a card title,
  // so both of the audit's recall paths are closed at once: the fact scan
  // never sees it, and the title scan skips it precisely BECAUSE the
  // dictionary knows the word. There is no automatic test for "this
  // dictionary entry is an anglicisation", which is why the list is curated.
  // This pins the mechanism: a word on the list is queued anyway.
  const tiers = await tiersOf({
    id: "synthetic-3",
    title: "Constantinople Falls",
    fact: "The gates opened and the last defenders of the city gave way.",
  });
  assert.equal(tiers.get("constantinople"), CONTEXT, "a borrowed name the dictionary knows was not queued");
});

test("every curated borrowed name is a real word in a real deck", { skip }, () => {
  // A stale entry would quietly reinstate the blind spot. The check is against
  // the RAW text, before the lexicon respellings — "bastille" no longer
  // survives into the spoken text, and that is the point of its respelling.
  const raw = deckRawText();
  const names = borrowedNames();
  assert.ok(names.length > 0, "the borrowed-name list is empty — has the blind spot come back?");
  for (const name of names) {
    assert.ok(raw.includes(name), `"${name}" is on the borrowed-name list but no deck mentions it`);
  }
});

test("an unfamiliar name in a TITLE ONLY is queued for the ear", { skip }, async () => {
  // This is where Aotearoa lived. The name scan reads fact text, so a title-only
  // name used to pass in silence — a whole class, not one word.
  const tiers = await tiersOf({
    id: "synthetic-2",
    title: "Whakatoa Sails to Rapa",
    fact: "The voyage took months and nobody wrote it down.",
  });
  assert.equal(tiers.get("whakatoa"), NO_REFERENCE, "a title-only name was not queued");
  assert.equal(tiers.get("rapa"), NO_REFERENCE, "a second title-only name was not queued");
});

test("a macron is enough on its own to flag a word", { skip }, async () => {
  // Non-ASCII spelling needs no dictionary and no capital letter, so it is the
  // backstop for a name in any position. It also used to be dead code: the
  // tokeniser was ASCII-only, so "Māori" arrived as the single letter "M" and
  // the rule could never match. Both halves are asserted here.
  const tiers = await tiersOf({
    id: "synthetic-3",
    title: "An Event",
    fact: "A Māori carver worked on the meeting house for years.",
  });
  assert.equal(tiers.get("māori"), NO_REFERENCE, "a macron-spelled name was not queued");
});

test("punctuation is not a spelling: possessives and compounds are not flagged non-ASCII", { skip }, async () => {
  // The Unicode fix re-admitted the noise the first tightening pass removed:
  // every possessive in the corpus ("Caesar’s", "England’s") trips a naive
  // non-ASCII test, and reading the rule as "non-letter" then flagged every
  // compound title ("X-ray", "post-civil") too. Fold, and measure the right
  // thing, or the real accented names drown in punctuation.
  //
  // Asserted on the *rule*, not the tier: "X-ray" has a real disagreement
  // with the dictionary (it is in there, stressed on the other syllable), and
  // that is a different finding from a spelling flag.
  const { findings } = await triage(
    fakeDeck({
      id: "synthetic-5",
      title: "An Event",
      fact: "England’s mills and the X-ray scans of her bones.",
    })
  );
  for (const word of ["england’s", "x-ray"]) {
    const finding = findings.find((f) => f.word === word);
    assert.ok(
      !finding || !finding.why.includes("non-ASCII"),
      `"${word}" was flagged as non-ASCII — a curly apostrophe or an ASCII hyphen is punctuation, not a spelling`
    );
  }
  // …and the rule must still fire on a real accent, or the test above is vacuous.
  const accented = await tiersOf({
    id: "synthetic-6",
    title: "An Event",
    fact: "A Māori carver worked on the meeting house for years.",
  });
  assert.equal(accented.get("māori"), NO_REFERENCE);
});

test("a name the dictionary gets wrong is NOT caught — that is the ear's job", { skip }, async () => {
  // The honest limit of the whole system, asserted so nobody closes the
  // question prematurely. CMUdict has "maui" as M AW1 IY0, the engine agrees,
  // and "maui" comes out "MOW-ee" instead of "Mow-i". A reference-based tier
  // can only be as good as the reference, and a name the dictionary has
  // anglicised is confidently dismissed — no tier sends it to the ear.
  const tiers = await tiersOf({
    id: "synthetic-4",
    title: "Maui Sails",
    fact: "He fished up the islands with a hook made of bone.",
  });
  const tier = tiers.get("maui");
  assert.ok(
    tier == null || tier === AGREES,
    `"maui" was queued for the ear (tier ${tier}) — if this ever changes, the anglicised-reference gap has been closed`
  );
  assert.equal(await phonemesFor("maui"), "mˈaʊiː", "the anglicised reading is what the engine produces");
});

/* ------------------------------------------------------------- worksheet */

import { renderWorksheet, worksheetRows } from "../audit.mjs";
import { CONFIRMED, DEFERRED, FIXED, RECORDS } from "../lexicon-records.mjs";

test("every settled row carries a terminal status, and nothing else does", { skip }, async () => {
  // worksheetRows deliberately includes words that DO have records, so that
  // finished work is visible rather than handed back as `open`. What must hold
  // is that "settled" means a terminal outcome, never a half-finished one.
  const triages = await triageAll();
  const rows = triages.flatMap((t) => worksheetRows(t));
  for (const r of rows) {
    if (!r.settled) {
      assert.equal(r.record, null, `"${r.word}" is unsettled yet carries a record`);
      continue;
    }
    assert.ok(
      [FIXED, CONFIRMED, DEFERRED].includes(r.record.status),
      `"${r.word}" is settled with a non-terminal status ${JSON.stringify(r.record.status)}`
    );
  }
});

test("a word with a record is marked settled, so finished work is not re-opened", { skip }, async () => {
  // The deck under audit has 16 no-reference words, all now resolved. They
  // still lack dictionary entries, so they still appear in the tier — but they
  // must not be handed back as `open`, or the next pass redoes them.
  const triages = await triageAll();
  const rows = triages.flatMap((t) => worksheetRows(t));
  const settled = rows.filter((r) => r.settled);
  assert.ok(settled.length > 0, "expected some settled words");
  for (const r of settled) {
    assert.ok(RECORDS.has(r.word), `"${r.word}" is marked settled but has no record`);
    assert.ok(r.record.reason, `"${r.word}" is settled with no reason recorded`);
  }
  // And the settlement must not be a blanket claim: a word nobody has looked up
  // must still come back open.
  assert.ok(rows.some((r) => !r.settled), "every word settled, which cannot be right");
});

test("the worksheet separates what is open from what is done", { skip }, async () => {
  const triages = await triageAll();
  const rowsByDeck = triages.map((t) => ({ deck: t.deck, rows: worksheetRows(t) })).filter((d) => d.rows.length);
  const sheet = renderWorksheet(rowsByDeck);
  const all = rowsByDeck.flatMap((d) => d.rows);
  const open = all.filter((r) => !r.settled).length;
  assert.match(sheet, new RegExp(`\\*\\*${open} open\\*\\*`), "the sheet must state how many are open");
  for (const r of all) {
    const expected = r.settled ? `\`${r.record.status}\`` : "`open`";
    assert.ok(sheet.includes(`\`${r.word}\``), `${r.word} is missing from the worksheet`);
  }
});
