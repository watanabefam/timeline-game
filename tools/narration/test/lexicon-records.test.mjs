// Tests for the pronunciation record layer and the matcher that applies it.
//
// The matcher tests are mostly REGRESSION tests for a real bug: `applyLexicon`
// used to interpolate the lexicon key straight into `new RegExp(...)`, so a
// key was a PATTERN rather than literal text. A key containing a dot matched
// any character ("a.b" also rewrote "axb"), and a key containing parentheses
// became a capture group and so never matched at all ("cote (divoire)"). Both
// failure modes are silent: one entry fires on the wrong word, another does
// nothing, and the suite is green either way. No shipped entry was affected —
// all eight keys happen to be metacharacter-free — but the backlog is 159
// exotic proper nouns, which is exactly where this bites.
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyLexicon, compileLexiconKey, LEXICON } from "../text.mjs";

/* ----------------------------------------------------------------- matcher */

test("REGRESSION: a key is literal text, not a regex pattern", () => {
  // The dot must be a literal dot. Before the fix this matched "axb" too.
  const re = compileLexiconKey("a.b");
  assert.equal(re.test("a.b"), true, "the literal form must match");
  assert.equal(re.test("axb"), false, "a dot in a key must not act as a wildcard");
});

test("REGRESSION: regex metacharacters in a key do not become syntax", () => {
  // Parentheses used to open a capture group, so the key never matched.
  const re = compileLexiconKey("cote (divoire)");
  assert.equal(re.test("cote (divoire)"), true, "a key with parens must still match itself");
  assert.equal(re.test("cote divoire"), false, "the parens must be part of the key, not a group");
});

test("REGRESSION: the other metacharacters are escaped too", () => {
  // Every one of these used to be interpreted as syntax. `?` and `*` are
  // quantifiers, `+` is a quantifier, `|` is alternation, `[` opens a class,
  // `{` opens a bound, `^`/`$` anchor, and a bare `\` escapes what follows.
  for (const key of ["a?b", "a*b", "a+b", "a|b", "a[b", "a{2}", "^a", "a$", "a\\b", "a^b"]) {
    const re = compileLexiconKey(key);
    assert.equal(re.test(key), true, `key ${JSON.stringify(key)} must match itself`);
  }
  // And the quantifiers must not have become "optional" or "repeated".
  assert.equal(compileLexiconKey("a?b").test("ab"), false, "? must not make the dot optional");
  assert.equal(compileLexiconKey("a*b").test("ab"), false, "* must not make the b repeatable");
});

test("a key still matches on word boundaries, not mid-word", () => {
  const re = compileLexiconKey("medina");
  assert.equal(re.test("medina"), true);
  assert.equal(re.test("the medina card"), true);
  assert.equal(re.test("medinas"), false, "must not match inside a longer word");
  assert.equal(re.test("intermedia"), false, "must not match inside a longer word");
});

test("a key matches case-insensitively, because the matcher is applied that way", () => {
  // The shipped matcher has always been case-insensitive, so the key's case is
  // decorative. That is why two keys differing only in case are forbidden
  // (enforced in the record invariants) — the second would be unreachable.
  const re = compileLexiconKey("Bastille");
  assert.equal(re.test("bastille"), true);
  assert.equal(re.test("BASTILLE"), true);
  assert.equal(re.test("Bastille"), true);
});

test("a multi-word key matches as a phrase", () => {
  const re = compileLexiconKey("World War I");
  assert.equal(re.test("The World War I card"), true);
  // \b on the trailing "I" is what stops this from eating "World War II" —
  // the shipped lexicon relies on it, so it is pinned here.
  assert.equal(re.test("World War II"), false, `"World War I" must not match "World War II"`);
});

test("a key with non-ASCII letters matches the whole word", () => {
  // \b is ASCII-only, so a Maori or Arabic name must not be split or
  // half-matched. The audit's own tokeniser is Unicode-aware for the same
  // reason ("Māori" is one word).
  const re = compileLexiconKey("Māori");
  assert.equal(re.test("the Māori people"), true);
  assert.equal(re.test("Māori"), true);
});

test("applyLexicon rewrites only the literal key, in any case", () => {
  // Exercised through temporary entries so the shipped lexicon is untouched.
  const added = [
    ["zztestdot", "ZZDOT"],
    ["a.b", "DOTTED"],
  ];
  for (const [k, v] of added) LEXICON.set(k, v);
  try {
    assert.equal(applyLexicon("a.b and axb"), "DOTTED and axb");
    assert.equal(applyLexicon("A.B here"), "DOTTED here");
    assert.equal(applyLexicon("zztestdot"), "ZZDOT");
  } finally {
    for (const [k] of added) LEXICON.delete(k);
  }
});

/* ----------------------------------------------------------- the records */

import {
  CONFIRMED,
  DECISION_TYPES,
  DEFERRED,
  DEFERRED_KINDS,
  FIXED,
  RECORDS,
  SOURCE_KINDS,
  rejectedListIsWellFormed,
  validDecisionType,
  validDeferredKind,
  validSourceKind,
} from "../lexicon-records.mjs";

const fixedWords = () => [...RECORDS].filter(([, r]) => r.status === FIXED).map(([w]) => w);

test("every LEXICON key has a record", () => {
  // The gap this whole layer exists to close: an override with nothing behind
  // it used to pass the entire suite.
  const missing = [...LEXICON.keys()].filter((k) => !RECORDS.has(k));
  assert.deepEqual(missing, [], `lexicon entries with no record: ${missing.join(", ")} — add one, or drop the entry`);
});

test("a FIXED record has a lexicon entry to fix", () => {
  // CONFIRMED and DEFERRED records deliberately have none: there is nothing to
  // override. A `fixed` record with no entry is a record describing a fix that
  // does not exist.
  const orphan = fixedWords().filter((k) => !LEXICON.has(k));
  assert.deepEqual(orphan, [], `records marked fixed with no lexicon entry: ${orphan.join(", ")} — they document nothing`);
});

test("the fixed records and the lexicon agree on keys exactly, case included", () => {
  assert.deepEqual(fixedWords().sort(), [...LEXICON.keys()].sort());
});

test("no two keys collide case-insensitively", () => {
  // The matcher is case-insensitive, so a second key differing only in case
  // would be unreachable — the first would always win.
  const seen = new Map();
  for (const k of LEXICON.keys()) {
    const fold = k.toLowerCase();
    assert.equal(seen.has(fold), false, `"${k}" and "${seen.get(fold)}" are the same key once case is ignored`);
    seen.set(fold, k);
  }
});

test("no alias is also a key, so a substitution cannot feed itself", () => {
  // Keys and aliases are different namespaces. "World War One" is an alias and
  // is never a key; if it were, applyLexicon would rewrite a word into a form
  // a later pass rewrites again.
  const keys = new Set([...LEXICON.keys()].map((k) => k.toLowerCase()));
  for (const [key, alias] of LEXICON) {
    assert.equal(keys.has(String(alias).toLowerCase()), false, `the alias for "${key}" is also a key — substitution could feed itself`);
  }
});

test("every record names a status this project recognises", () => {
  for (const [word, r] of RECORDS) {
    assert.ok([FIXED, CONFIRMED, DEFERRED].includes(r.status), `"${word}" has status ${JSON.stringify(r.status)}`);
  }
});

test("a FIXED record carries a phoneme; the others must not pretend to", () => {
  for (const [word, r] of RECORDS) {
    if (r.status === FIXED) {
      assert.ok(r.phoneme, `"${word}" is fixed but records no verified phoneme`);
    } else {
      assert.equal(r.phoneme, undefined, `"${word}" is ${r.status}, so it has no override phoneme to verify`);
    }
  }
});

test("a DEFERRED record says why it could not be fixed", () => {
  // The status exists so that a word we investigated and could not reach is a
  // durable outcome rather than a gap. Without the reason it is just a shrug,
  // and the next person repeats the whole investigation.
  for (const [word, r] of RECORDS) {
    if (r.status !== DEFERRED) continue;
    assert.equal(LEXICON.has(word), false, `"${word}" is deferred, so it must not also carry a lexicon entry`);
    assert.ok(r.deferredBecause, `"${word}" is deferred but records no reason`);
    assert.ok(r.deferredBecause.trim().length > 20, `"${word}" has a too-thin reason for deferring`);
  }
});

test("a CONFIRMED record has no lexicon entry, because there is nothing to override", () => {
  for (const [word, r] of RECORDS) {
    if (r.status !== CONFIRMED) continue;
    assert.equal(LEXICON.has(word), false, `"${word}" is confirmed correct, so it must not carry an override`);
  }
});

test("every record gives a short human-readable reason", () => {
  for (const [word, r] of RECORDS) {
    assert.equal(typeof r.reason, "string", `"${word}" has no reason`);
    assert.ok(r.reason.trim().length > 0, `"${word}" has an empty reason`);
  }
});

test("every record's source is complete for its kind", () => {
  for (const [word, r] of RECORDS) {
    const s = r.source;
    assert.ok(s, `"${word}" has no source — a reason is never a substitute for provenance`);
    assert.ok(validSourceKind(s.kind), `"${word}" has source kind ${JSON.stringify(s.kind)}; expected one of ${SOURCE_KINDS.join(", ")}`);
    assert.ok(s.date, `"${word}" has no date on its source`);
    if (s.kind === "reference") {
      assert.ok(s.citation, `"${word}" is a reference but names no consulted authority`);
    }
    if (s.kind === "measurement") {
      assert.ok(s.note, `"${word}" is a measurement but records nothing about what was measured`);
    }
    if (s.kind === "decision") {
      assert.ok(validDecisionType(s.decisionType), `"${word}" has decision type ${JSON.stringify(s.decisionType)}; expected one of ${DECISION_TYPES.join(", ")}`);
      assert.ok(s.decidedBy, `"${word}" is a decision but does not say who decided`);
      assert.equal(s.citation, undefined, `"${word}" is a decision, not a consulted authority — drop the citation`);
    }
  }
});

test("a decision never claims to be a pronunciation authority", () => {
  // The distinction that keeps the provenance model honest: a decision says
  // what this project chooses to say, never what the language does.
  for (const [word, r] of RECORDS) {
    if (r.source.kind !== "decision") continue;
    assert.match(r.source.decidedBy, /\S/, `"${word}" must name who decided`);
  }
});

/* ------------------------------------------------------- the citation URL */

test("a reference says whether a page was opened: a url XOR an admission", () => {
  // The failure this exists for: `cleisthenes` carried the sentence "Wiktionary
  // has no entry for this name, so no URL is claimed", which was false, and it
  // lived inside `citation` where a test could only see "a string is present".
  // Requiring exactly one of the two fields puts the claim somewhere a reader
  // can check and a test can require — and `noUrlBecause` has to say something
  // real, so it cannot be satisfied by an empty string or a restatement.
  for (const [word, r] of RECORDS) {
    if (r.source.kind !== "reference") continue;
    const s = r.source;
    const hasUrl = typeof s.url === "string" && s.url.length > 0;
    const hasWhy = typeof s.noUrlBecause === "string" && s.noUrlBecause.length > 0;
    assert.ok(
      hasUrl !== hasWhy,
      `"${word}" is a reference and must carry exactly one of url / noUrlBecause ` +
        `(url=${hasUrl ? "yes" : "no"}, noUrlBecause=${hasWhy ? "yes" : "no"})`
    );
  }
});

test("an admission that no page was opened is a reason, not a shrug", () => {
  for (const [word, r] of RECORDS) {
    const why = r.source?.noUrlBecause;
    if (why == null) continue;
    assert.ok(
      why.trim().length > 30,
      `"${word}" says no URL in ${why.trim().length} characters — say WHY there was none`
    );
    assert.notEqual(
      why.trim(),
      String(r.source.citation ?? "").trim(),
      `"${word}" repeats its citation as its excuse for having no URL`
    );
  }
});

test("a url is an absolute http(s) URL, not a promise of one", () => {
  for (const [word, r] of RECORDS) {
    const url = r.source?.url;
    if (url == null) continue;
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      assert.fail(`"${word}" has a url that is not a URL: ${url}`);
    }
    assert.ok(
      parsed.protocol === "https:" || parsed.protocol === "http:",
      `"${word}" has a ${parsed.protocol} url; only http(s) can be link-checked`
    );
  }
});

test("the deferred kind is one this project recognises, and names a real class", () => {
  for (const [word, r] of RECORDS) {
    if (r.status !== DEFERRED) continue;
    assert.ok(
      validDeferredKind(r.deferredKind),
      `"${word}" is deferred with kind ${JSON.stringify(r.deferredKind)}; expected one of ${DEFERRED_KINDS.join(", ")}`
    );
  }
});

test("only deferred records carry a deferredKind", () => {
  for (const [word, r] of RECORDS) {
    if (r.status === DEFERRED) continue;
    assert.equal(r.deferredKind, undefined, `"${word}" is ${r.status}, so it has nothing to defer`);
  }
});

test("a rejected reading, if recorded, is recorded as a reading and a reason", () => {
  // Optional by design — a source that agrees with us needs no rebuttal, and
  // nothing here can tell whether a REASON is any good. But a rival reading
  // that was found and then dropped silently is the same loss as the false
  // citation, so if there is one it must say what it was and why it lost.
  for (const [word, r] of RECORDS) {
    assert.ok(
      rejectedListIsWellFormed(r.source?.rejected),
      `"${word}" has a malformed rejected list: ${JSON.stringify(r.source?.rejected)}`
    );
    for (const row of r.source?.rejected ?? []) {
      assert.match(row.reading.trim(), /\S/, `"${word}" lists a rejection with no reading`);
      assert.ok(row.why.trim().length > 20, `"${word}" rejects "${row.reading}" with no reason`);
    }
  }
});

test("the record that corrected itself keeps the wrong reading on file", () => {
  // `cleisthenes` shipped "kly-stee-neez", justified by a citation that was
  // false. The correction is only auditable because the superseded reading is
  // still there — a fix whose history was deleted is a fix nobody can check.
  const r = RECORDS.get("cleisthenes");
  const rejected = (r.source.rejected ?? []).map((x) => x.reading).join(" | ");
  assert.match(rejected, /kly-stee-neez/, "the reading that actually shipped must be on record as rejected");
});
