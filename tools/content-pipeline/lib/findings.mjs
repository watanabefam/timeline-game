// findings.mjs — the shape every rule emits, plus summary/exit-code helpers.

/**
 * @typedef {Object} Finding
 * @property {string} rule      Stable rule id (e.g. "LICENSE_FORBIDDEN")
 * @property {"error"|"warning"|"info"} severity
 * @property {string} message   Human-readable, ideally actionable
 * @property {string} [event]   Event id
 * @property {string} [path]    Field path (e.g. "fact", "source.license")
 * @property {string} [hint]    How to fix
 */

export function finding(rule, severity, message, extra = {}) {
  const def = RULE_HINTS[rule];
  return { rule, severity, message, hint: extra.hint || (def && def.hint), ...extra };
}

export function summarize(findings) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  return {
    errors: counts.error,
    warnings: counts.warning,
    infos: counts.info,
    total: findings.length,
  };
}

const RANK = { info: 0, warning: 1, error: 2 };

/** Exit 1 if any finding is at or above `failLevel`; otherwise 0. */
export function exitCode(findings, failLevel = "error") {
  const threshold = RANK[failLevel] ?? RANK.error;
  return findings.some((f) => (RANK[f.severity] ?? 0) >= threshold) ? 1 : 0;
}

// Tier-3 help (`verify explain <RULE>`). Kept here so rules and docs stay in sync.
export const RULE_HINTS = {
  SCHEMA: { hint: "Fix the field named in the path; check required fields and types." },
  SOURCE_UNREGISTERED: { hint: "Add the domain to registry/sources.json with its SPDX license and rights status." },
  LICENSE_MISSING: { hint: "Set source.license to a known SPDX identifier in registry/sources.json." },
  LICENSE_FORBIDDEN: { hint: "Replace the source, or clear the use; forbidden licenses cannot ship." },
  ATTRIBUTION_MISSING: { hint: "Add source.attribution (creator + source + license)." },
  GROUNDING: { hint: "Verify the named entities against the frozen source, or remove them." },
  LAYER_REDUNDANCY: { hint: "Give each layer one job; remove the restated claim." },
  YEAR_LEAK: { hint: "Keep years in the `year` field — fact/why are read aloud before placement." },
  READABILITY_BAND: { hint: "Simplify or expand the summary to fit the target grade band." },
  CLAIM_SHAPE: { hint: "Each claim needs a unique id and non-empty text." },
  CLAIM_NO_QUOTE: { hint: "Every claim needs a verbatim supporting quote from the frozen source." },
  CLAIM_UNSUPPORTED: { hint: "The quote is not in the source — remove the claim or fix the source." },
  STORY_SOURCE_MISSING: {
    hint: "Set storySource (retold | adapted | abridged | paraphrased | summarised | translated | quoted | invented | original).",
  },
  SOURCE_USEDFOR_MISSING: {
    hint: "Give every source a `usedFor` — what it backs up (the 'Used for' column).",
  },
  STORY_TRACE_UNRESOLVED: { hint: "A sentence asserts something about the world that no claim covers. Ground it, or rewrite it to assert less." },
  STORY_TRACE_COUNT: { hint: "One trace entry per SENTENCE (not per paragraph)." },
  FIELD_TRACE_UNRESOLVED: { hint: "Same as STORY_TRACE_UNRESOLVED, on an expository field." },
  STORY_OFF_EVENT: { hint: "The story cites none of the event's identity claims — it may be about an adjacent event." },
  IDENTITY_CLAIMS_MISSING: { hint: "Declare which claim(s) state what this event IS." },
  IDENTITY_CLAIM_UNKNOWN: { hint: "identityClaims cites a claim that does not exist." },
  IDENTITY_NOT_IN_FACT: { hint: "`fact` should state what happened; significance belongs in `why`." },
  STORY_READABILITY: { hint: "Story grade outside 3–7 — drift toward harder prose than a read-aloud for ages 8–11." },
  SENTENCE_OVER_LIMIT: { hint: "One sentence is too long. Flesch–Kincaid averages and cannot see this; a child reading aloud cannot either." },
  SENTENCE_AVG_HIGH: { hint: "Average sentence length is high for the age band." },
  ESSAY_BLOCK: { hint: "A long block with no actor, no sensory detail and no action has stopped being a scene. Give it someone doing something, or cut it." },
  EXPOSITION_DRIFT: { hint: "Several consecutive exposition blocks — the story has drifted into essay." },
  SPINE_MISSING: { hint: "Declare the goal-directed episode (want/obstacle/turn/outcome) before drafting." },
  SPINE_SHAPE: { hint: "All four beats must be non-empty strings." },
  SPINE_UNUSED: { hint: "A spine with no story to govern." },
  DEPTH_SHALLOW: { hint: "Declared shallow tier — a summary that is reviewed against its source, not traced to claims." },
  FIELD_TRACE_MISSING: { hint: "Trace each unit of fact/why/summary/details to the claims backing it — `[]` for reconstructed material." },
  FIELD_TRACE_SHAPE: { hint: "Each trace entry must be a list of claim-id strings." },
  FIELD_TRACE_COUNT: { hint: "One trace entry per sentence (summary/details) or per line (fact/why)." },
  FIELD_TRACE_UNKNOWN_CLAIM: { hint: "The cited claim does not exist." },
  FIELD_TRACE_DUPLICATE_CLAIM: { hint: "A claim id is listed twice in one unit." },
  FIELD_TRACE_UNSUPPORTED_CLAIM: { hint: "The cited claim has no verbatim source quote." },
  FIELD_TRACE_EMPTY: { hint: "Declared reconstructed — review it for claims about the world." },
  FORMAT_MISSING: { hint: "Declare the device (format) so the drafter gets a brief — see registry/devices.json." },
  FORMAT_UNKNOWN: { hint: "Use a device id from registry/devices.json." },
  STORY_TRACE_MISSING: {
    hint: "Trace each story paragraph to the claims that back it; use [] for invented narrative.",
  },
  STORY_TRACE: { hint: "storyTrace must have one entry per paragraph, citing existing claim ids." },
  STORY_TRACE_INVENTED: {
    hint: "Invented paragraphs cannot be machine-checked — review each one for claims about the world.",
  },
  STORY_LENGTH: {
    hint: "Write a scene, not a summary — 300-700 words (SOTW vignettes run ~530-1,000).",
  },
  META_OVERLAP: {
    hint: "`changed` = what we did to the text; `storyNote` = what is record vs invention. Don't restate one in the other.",
  },
  CHANGED_MISSING: {
    hint: "Add a `changed` note describing what you altered (e.g. 'Shortened and simplified; names and dates kept as in the source').",
  },
};
