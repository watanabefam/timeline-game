// provenance.mjs — build an auditable ledger record for a deck.
// Pure functions (hashing + assembly) so the shape is unit-testable.

import { createHash } from "node:crypto";
import { summarize } from "./findings.mjs";

export const VERIFIER_VERSION = "0.1.0";

// Fields that make up an event's player-facing content hash.
const CONTENT_FIELDS = ["title", "fact", "who", "where", "why", "summary", "story", "details"];

export function sha256(text) {
  return "sha256:" + createHash("sha256").update(String(text ?? ""), "utf8").digest("hex");
}

export function eventContentHash(e) {
  return sha256(CONTENT_FIELDS.map((f) => `${f}=${(e && e[f]) || ""}`).join("\n"));
}

/**
 * @param {object} deck
 * @param {{sources?:Record<string,string>, findings?:Array, deckRevision?:number|null,
 *          generatedAt?:string, verifierVersion?:string}} ctx
 */
export function buildProvenance(
  deck,
  {
    sources = {},
    findings = [],
    deckRevision = null,
    generatedAt = new Date().toISOString(),
    verifierVersion = VERIFIER_VERSION,
  } = {},
) {
  const perEvent = (id) => findings.filter((f) => f.event === id);
  const errs = (id) => perEvent(id).filter((f) => f.severity === "error").length;
  const warns = (id) => perEvent(id).filter((f) => f.severity === "warning").length;

  const events = (deck.events || []).map((e) => ({
    id: e.id,
    contentHash: eventContentHash(e),
    sourceHash: sources[e.id] ? sha256(sources[e.id]) : null,
    source: e.source
      ? { url: e.source.url, revision: e.source.revision ?? null, license: e.source.license }
      : null,
    claims: Array.isArray(e.claims) ? e.claims.length : 0,
    verification: { errors: errs(e.id), warnings: warns(e.id) },
    // "blocked" if the gates found errors; otherwise pending human sign-off.
    review: errs(e.id) ? "blocked" : "pending",
  }));

  return {
    schemaVersion: 1,
    deck: deck.id,
    deckRevision,
    verifierVersion,
    generatedAt,
    summary: { events: events.length, ...summarize(findings) },
    events,
  };
}
