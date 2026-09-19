# tools/content-pipeline

Author-time **verification core** for deck content — the trustworthy half of the
pipeline described in [`doc/CONTENT_PIPELINE.md`](../../doc/CONTENT_PIPELINE.md).

- **No LLM, no network, no API keys.** Fully deterministic and unit-tested.
- **Not shipped.** Author-time tooling only; the game core is untouched.
- Drafting is a *pluggable stage* (agent / API / human). See the doc.

## Commands

```bash
npm install                                   # ajv + ajv-formats (dev only)

npm test                                      # node --test — 45 tests, no keys

# verify one deck (or a draft)
node verify.mjs <deck.json> [--sources <dir>] [--fail-level error|warning|info] [--format text|json]
node verify.mjs explain <RULE>                # Tier-3 rule documentation

# verify every deck in decks/manifest.json (used by `npm run validate`)
node verify-all.mjs [--verbose] [--fail-level error] [--format text|json]

# pin + snapshot a source, then paste the printed record onto the event
node fetch-source.mjs "Great Pyramid of Giza" --id pyramids --out content/sources

# write an auditable provenance record
node provenance.mjs <deck.json> [--sources <dir>] [--out content/provenance/<id>.json] [--revision N]

# print the drafting brief for an event (claims, device, POV, forbidden moves)
node brief.mjs <deck.js> [--id <eventId>] [--out <dir>]

# detect source drift — has an article we pinned since been revised?
node check-sources.mjs [deck.js] [--format json] [--delay ms]

# generate a self-contained HTML review packet (opens from file://)
node review.mjs <deck.json> [--sources <dir>] [--out content/review/<id>.html]
```

Exit codes: `0` pass · `1` findings at or above `--fail-level` · `2` fatal/config error.

## Reasoning the gate encodes

1. **Errors block, warnings advise.** Structure and licensing are hard gates;
   content-quality heuristics are review-triage signals.
2. **Fail-closed licensing.** An unknown or unlisted license resolves to
   `forbidden` — the app ships nothing whose rights are unclear.
3. **Every claim needs a supporting span.** A draft claim without a verbatim
   quote from the frozen source is a fabrication risk and blocks.
4. **No source → no ship.** New decks require a registered, licensed source per
   event. Pre-existing decks are *grandfathered* (warning) until backfilled.

## Rules

| Rule | Severity | Checks |
|---|---|---|
| `SCHEMA` | error | Structure, types, required fields, no unexpected keys |
| `SOURCE_MISSING` | error | Event has a `source` (warning for grandfathered decks) |
| `SOURCE_UNREGISTERED` | error | Source domain is in `registry/sources.json` |
| `LICENSE_MISSING` | error | License is known to the registry (fail-closed) |
| `LICENSE_FORBIDDEN` | error | License category is not `forbidden` |
| `ATTRIBUTION_MISSING` | error | Attribution present when the license requires it |
| `CLAIM_NO_QUOTE` | error | Every draft claim carries a supporting quote |
| `CLAIM_UNSUPPORTED` | error | The claim's quote appears in the frozen source |
| `GROUNDING` | warning | Proper nouns in prose appear in the frozen source |
| `LAYER_REDUNDANCY` | warning | `fact`/`why`/`summary`/`story`/`details` don't restate each other |
| `YEAR_LEAK` | warning | No years in `fact`/`why` (narration reads these aloud) |
| `READABILITY_BAND` | warning | `summary` grade level is inside the target band |

## Layout

```
schema/deck.schema.json     the draft contract (Draft 2020-12)
registry/sources.json       SPDX source allowlist (policy-as-code)
lib/                        schema, license, rules, verify, load, source, provenance
verify.mjs                  verify one deck
verify-all.mjs              verify every deck in the manifest
fetch-source.mjs            pin + snapshot a source
provenance.mjs              write an auditable record
review.mjs                  generate the HTML review packet
test/                       node --test suites + fixtures
```
