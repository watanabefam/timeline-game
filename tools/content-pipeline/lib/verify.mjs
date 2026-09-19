// verify.mjs (lib) — the pure verifier: deck + registry + optional sources → findings.

import { finding } from "./findings.mjs";
import { validateDeckSchema } from "./schema.mjs";
import { checkSource } from "./license.mjs";
import {
  checkYearLeak,
  checkRedundancy,
  checkGrounding,
  checkReadability,
  checkStoryReadability,
  checkSentenceLength,
  checkClaims,
  checkStorySource,
  checkSources,
  checkChanged,
  checkStoryLength,
  checkStoryTrace,
  checkFormat,
  checkMetaOverlap,
  checkFieldTrace,
  checkDepth,
  checkSpine,
  checkExposition,
  checkStoryRelevance,
} from "./rules.mjs";

/** Map Ajv errors to findings. */
function schemaFindings(errors) {
  return errors.map((err) => {
    const path = (err.instancePath || "").replace(/^\//, "").replace(/\//g, ".");
    return finding("SCHEMA", "error", `${path || "(root)"} ${err.message}`, { path });
  });
}

/**
 * @param {object} deck
 * @param {{registry: object, sources?: Record<string,string>, options?: object}} ctx
 * @returns {import("./findings.mjs").Finding[]}
 */
export function verifyDeck(deck, { registry, sources = {}, options = {} } = {}) {
  const out = [];
  out.push(...schemaFindings(validateDeckSchema(deck)));

  const events = Array.isArray(deck && deck.events) ? deck.events : [];
  for (const e of events) {
    if (!e || typeof e !== "object") continue;
    out.push(...checkSource(registry, e));
    out.push(...checkYearLeak(e));
    out.push(...checkRedundancy(e, options.redundancy));
    out.push(...checkReadability(e, options.readability));
    out.push(...checkStoryReadability(e, options.storyReadability));
    out.push(...checkSentenceLength(e, options.sentenceLength));
    out.push(...checkStorySource(e));
    out.push(...checkSources(e));
    out.push(...checkChanged(e));
    out.push(...checkStoryLength(e));
    out.push(...checkStoryTrace(e));
    out.push(...checkFormat(e));
    out.push(...checkMetaOverlap(e));
    out.push(...checkFieldTrace(e, options));
    out.push(...checkDepth(e));
    out.push(...checkSpine(e));
    out.push(...checkExposition(e));
    out.push(...checkStoryRelevance(e));
    if (sources[e.id]) {
      out.push(...checkGrounding(e, sources[e.id]));
      out.push(...checkClaims(e, sources[e.id]));
    }
  }
  return out;
}
