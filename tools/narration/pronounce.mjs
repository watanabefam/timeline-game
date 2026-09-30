// Phoneme introspection for the narration pipeline — AUTHOR-TIME ONLY.
//
// Wraps the `phonemizer` package that ships inside tools/narration/node_modules
// (the same package kokoro-js uses at render time), so what we inspect here is
// byte-for-byte what the engine will speak. The game NEVER imports this file;
// every consumer must degrade gracefully when the dependency is absent
// (fresh clone without `npm --prefix tools/narration install`).
"use strict";

const cache = new Map(); // text → phonemes | null
let pending; // the in-flight import, so concurrent callers share one result

async function load() {
  if (pending) return pending;
  pending = import("phonemizer").catch(() => null); // devDependency not installed — callers skip, not crash
  return pending;
}

/** True when the engine's phonemizer is importable (i.e. deps installed). */
export async function phonemizerAvailable() {
  return (await load()) != null;
}

/** Phoneme string for a whole text, or null when the phonemizer is absent. */
export async function phonemesFor(text) {
  const m = await load();
  if (!m) return null;
  const s = String(text || "");
  if (cache.has(s)) return cache.get(s);
  const out = (await m.phonemize(s))[0] ?? null;
  cache.set(s, out);
  return out;
}

/** Phoneme string for a single word (safe for cache reuse), or null. */
export async function wordPhonemes(word) {
  return phonemesFor(String(word).trim());
}

/**
 * Words of a spoken line, keeping internal apostrophes and hyphens.
 * Unicode letters, like the audit's tokeniser: "Māori" is one word, and an
 * ASCII pattern that splits it into "M" and "ori" is worse than none.
 */
export function splitWords(text) {
  return String(text || "").match(/[\p{L}][\p{L}\p{M}'’-]*/gu) ?? [];
}

// The phoneme snapshots that used to live here as PHONEME_TARGETS now live in
// lexicon-records.mjs, alongside the evidence that justifies each one. They
// were a parallel map describing the same words as LEXICON, guarded by a test
// asserting the copies matched — which is strictly worse than one definition.
// Nothing is re-exported here on purpose: a second import path would let the
// old duplicate grow back.
