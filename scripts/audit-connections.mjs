#!/usr/bin/env node
/*
 * scripts/audit-connections.mjs
 * ------------------------------------------------------------------
 * The C2 instrument: what the authored connection graph actually says, and
 * which edges contradict their own counterfactual test.
 *
 * WHY THIS IS NOT AN AUTOMATED RE-TYPING
 * doc/CONNECTIONS.md §3 makes `type` a statement about CAUSAL STRENGTH, and
 * each label carries a stated counterfactual test ("without X, Y would not have
 * happened" for `necessary`; "X made Y more likely, but it could still have
 * happened" for `contributing`; "X set it off now" for `trigger`; "not causal
 * at all" for `echo`). Phase 0 rejected an automated/LLM classifier for exactly
 * this task, and repo rule 6 forbids an LLM as the source of a `reference`. So
 * this script does NOT re-type edges. It reports two things a human needs:
 *
 *   1. the per-deck / per-type DISTRIBUTION (does one label dominate? §3's
 *      anti-skew guard is 50%), and
 *   2. every edge whose OWN rationale contradicts its OWN type -- the
 *      counterfactual screen below, applied mechanically as vocabulary in the
 *      authored prose. It is a SCREEN, never a verdict: it reads English words,
 *      not history. An edge it flags may still be correctly typed, and an edge
 *      it passes is not thereby correct.
 *
 * It reads the graph through the SHIPPED connections.js `indexEdges()`, so the
 * audit describes exactly what the game serves -- including the RULE 1 drops
 * (dangling, self, unknown type, misordered) -- rather than the raw JSON.
 *
 * The 30-edge, two-pass Cohen's-kappa protocol lives in doc/CONNECTIONS.md §10.
 * This script produces its two machine-made halves:
 *   --sample N [--blind] --out FILE
 *                           a deterministic stratified sample + coding sheet
 *   --kappa A.csv B.csv     Cohen's kappa over two human coding passes, with
 *                           the interpretation bands, and the sample-size
 *                           caveat printed with it
 *
 * Exit codes:  0 = ran and reported (findings are advisory)
 *              1 = could not run  (a check that cannot run never reports clean)
 *              2 = usage error
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import vm from "node:vm";
import { loadDeck } from "../tools/content-pipeline/lib/load.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "..");
const decksDir = join(REPO_ROOT, "decks");

// §3's anti-skew guard. Mirrors the 50% warning in scripts/validate-content.mjs
// (see its connectionTypeWarnings). Change one, change both.
const SKEW_GUARD = 0.5;
// The four labels of §3, in strength order. `echo` is not causal at all.
const TYPES = ["necessary", "contributing", "trigger", "echo"];
// `trigger` means "set it off NOW -- the proximate spark, not the background
// condition" (§3). The clean case in this corpus is sputnik-1 -> apollo-11,
// eight years. A "proximate spark" across a wider horizon than this is worth a
// human look; the threshold is an argued choice, not a finding, which is exactly
// why it is reported as a screen.
const TRIGGER_MAX_GAP = 15;
// A rationale shorter than this cannot state a mechanism, so the counterfactual
// test has nothing to apply to.
const THIN_RATIONALE_WORDS = 6;

// ---------------------------------------------------------------------
// Vocabulary. Each entry is the codebook's own test, reduced to words that
// appear in ordinary rationale prose. Absence of a match proves nothing --
// that is the screen-not-verdict caveat above.
// ---------------------------------------------------------------------
// "not causal at all": a sentence that asserts the relation IS causal.
const CAUSAL_CLAIMS = [
  "because", "caused", "causes", "causing", "led to", "leads to", "resulted in",
  "results in", "gave rise to", "enabled", "made possible", "made it possible",
  "sparked", "triggered", "set off", "prompted", "brought about", "so that",
];
// "not causal at all": prose that claims only a parallel or a recurrence.
// Deliberately phrase-level rather than single ambiguous words: "against"
// contains "again", and "classical revival" is not a claim of recurrence, so a
// bare substring match produced false screens on both. Word-boundary matching
// plus the narrow phrases below keeps every hit worth a human's two seconds.
const PARALLEL_CLAIMS = [
  "parallel", "in parallel", "echoes", "echoed", "mirrors", "mirrored",
  "recurs", "recurrence", "recurred", "resembles", "same pattern",
  "same problem", "same argument", "same mechanism", "same question",
  "later example", "revival of", "repetition of", "happened again",
  "occurred again", "seen again",
];
// "would NOT have happened": hedges belong to `contributing`, not `necessary`.
const HEDGES = [
  "helped", "helps", "contributed to", "contributing to", "more likely",
  "made it easier", "influenced", "influence of", "one factor", "partly",
  "partially", "accelerated", "spurred", "aided", "fostered", "facilitated",
  "played a part", "played a role", "set the stage", "opened the door",
];
// "would NOT have happened": absolutes belong to `necessary`, not `contributing`.
const ABSOLUTES = [
  "could not have", "couldn't have", "impossible without", "would never",
  "would not have", "cannot exist without", "presupposes", "necessarily",
  "only possible", "depends on", "requires", "without which", "had to",
];

/** Word-boundary match, so "against" cannot match "again". */
function has(list, text) {
  return list.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text));
}

/** The screen. Returns an array of finding codes (possibly empty). */
function screenEdge(edge, gap) {
  const text = (edge.rationale || "").toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const findings = [];

  if (words.length < THIN_RATIONALE_WORDS) {
    findings.push({
      code: "THIN_RATIONALE",
      why: `rationale has ${words.length} word(s) — the counterfactual test has nothing to apply to`,
    });
  }
  if (edge.type === "echo") {
    if (has(CAUSAL_CLAIMS, text)) {
      findings.push({
        code: "ECHO_CAUSAL",
        why: "typed `echo` (“not causal at all”) but the rationale asserts a causal claim",
      });
    }
  } else if (has(PARALLEL_CLAIMS, text)) {
    findings.push({
      code: "CAUSAL_PARALLEL",
      why: `typed \`${edge.type}\` (causal) but the rationale reads as a parallel/recurrence, which is \`echo\``,
    });
  }
  if (edge.type === "necessary" && has(HEDGES, text)) {
    findings.push({
      code: "NECESSARY_HEDGED",
      why: "typed `necessary` (“would not have happened”) but the rationale hedges (“more likely”, “helped”)",
    });
  }
  if (edge.type === "contributing" && has(ABSOLUTES, text)) {
    findings.push({
      code: "CONTRIBUTING_ABSOLUTE",
      why: "typed `contributing` (“could still have happened”) but the rationale reads as a hard dependency",
    });
  }
  if (edge.type === "trigger" && gap !== null && gap > TRIGGER_MAX_GAP) {
    findings.push({
      code: "TRIGGER_FAR",
      why: `typed \`trigger\` (“set it off now”) across a ${gap}-year gap (> ${TRIGGER_MAX_GAP})`,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------
// Deck loading: decks/index.json -> decks/<id>/deck.json, then the fallback
// layouts the content gate also supports. A deck that cannot be read is a
// failure, not a deck with zero edges.
// ---------------------------------------------------------------------
function deckPaths() {
  const indexPath = join(decksDir, "index.json");
  if (!existsSync(indexPath)) throw new Error("decks/index.json is missing — run `npm run gen:index`");
  const idx = JSON.parse(readFileSync(indexPath, "utf8"));
  const list = Array.isArray(idx) ? idx : idx.decks || [];
  if (!list.length) throw new Error("decks/index.json has no deck entries");
  return list.map((e) => {
    if (typeof e === "string") {
      const p = join(decksDir, e);
      return { id: basename(e, ".js"), path: p };
    }
    const layout = e.layout || (e.file ? "file" : "folder");
    const id = e.id || e.dir || "unknown";
    return {
      id,
      path: layout === "file" ? join(decksDir, e.file) : join(decksDir, e.dir || id, e.entry || "deck.json"),
    };
  });
}

/** Every edge the game would serve for a deck, plus what indexEdges dropped. */
function collect(path) {
  const deck = loadDeck(path);
  const events = Array.isArray(deck.events) ? deck.events : [];
  const index = Connections.indexEdges(events);
  const byId = new Map(events.map((e) => (e && typeof e.id === "string" ? [e.id, e] : null)).filter(Boolean));

  const served = [];
  for (const [from, edges] of index.out) {
    for (const edge of edges) {
      const a = index.years.get(edge.from);
      const b = index.years.get(edge.to);
      served.push({
        from: edge.from,
        to: edge.to,
        type: edge.type,
        rationale: edge.rationale,
        contested: edge.contested,
        gap: a === undefined || b === undefined ? null : Math.abs(b - a),
        fromTitle: index.titles.get(edge.from) || edge.from,
        toTitle: index.titles.get(edge.to) || edge.to,
      });
    }
  }
  served.sort((x, y) => (x.from === y.from ? x.to.localeCompare(y.to) : x.from.localeCompare(y.from)));

  // What the raw JSON holds that the runtime will never serve (doc/CONNECTIONS.md §2).
  let authored = 0;
  const dropped = [];
  for (const ev of events) {
    if (!ev || !Array.isArray(ev.connections)) continue;
    authored += ev.connections.length;
    for (const c of ev.connections) {
      if (!c || typeof c.to !== "string") continue;
      const kept = served.some((s) => s.from === ev.id && s.to === c.to && s.type === c.type);
      if (!kept) {
        const to = byId.get(c.to);
        dropped.push({
          from: ev.id,
          to: c.to,
          type: c.type,
          reason: !to
            ? "dangling `to`"
            : c.to === ev.id
            ? "self-reference"
            : typeof c.type !== "string" || !TYPES.includes(c.type)
            ? `unknown type ${JSON.stringify(c.type)}`
            : "breaks the storage rule (stored on the later event)",
        });
      }
    }
  }
  return { id: deck.id, name: deck.name, events: events.length, authored, served, dropped };
}

// ---------------------------------------------------------------------
// The deterministic sample. Seeded from a fixed string (NOT Math.random) so
// the same corpus yields the same worksheet on every machine and every run --
// otherwise the two coding passes could not be compared to each other.
// ---------------------------------------------------------------------
function seededShuffle(list, seed) {
  let h = 2166136261;
  const s = `connections-kappa:${seed}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5; h >>>= 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Proportional allocation by largest remainder, one seat per non-empty stratum. */
function allocate(strata, total) {
  const live = strata.filter((s) => s.items.length > 0);
  const pool = live.reduce((n, s) => n + s.items.length, 0);
  if (!pool) return { plan: [], raised: 0 };
  // Every non-empty stratum keeps at least one seat, so a budget smaller than
  // the stratum count is raised rather than silently dropping a type — and the
  // caller is told, because a 30-edge sample that silently became 40 is not the
  // sample the protocol names.
  const target = Math.min(Math.max(total, live.length), pool);
  const exact = live.map((s) => ({ s, want: (s.items.length / pool) * target }));
  const seats = exact.map((e) => ({ s: e.s, n: Math.max(1, Math.floor(e.want)), frac: e.want - Math.floor(e.want) }));
  let left = target - seats.reduce((n, e) => n + e.n, 0);
  const order = seats.slice().sort((a, b) => b.frac - a.frac || b.s.items.length - a.s.items.length);
  // Hand out the remaining seats by largest fractional part, skipping any
  // stratum that has already given every edge it has.
  let guard = 0;
  while (left > 0 && guard++ < pool) {
    const e = order.find((x) => x.n < x.s.items.length);
    if (!e) break;
    e.n++;
    left--;
  }
  // One seat per non-empty stratum can OVERSHOOT the budget (12 strata, a
  // 30-edge protocol: the floor sums to 32). The budget wins and the trim comes
  // out of the largest stratum, so the sample stays exactly the size the
  // protocol names AND every deck:type stratum keeps at least one edge — type
  // coverage is what a kappa over a codebook is for.
  if (left < 0) {
    const bySize = seats.slice().sort((a, b) => b.n - a.n);
    guard = 0;
    while (left < 0 && guard++ < target + seats.length) {
      const e = bySize.find((x) => x.n > 1);
      if (!e) break;
      e.n--;
      left++;
    }
  }
  return {
    plan: seats.map((e) => ({ stratum: e.s, n: Math.min(e.n, e.s.items.length) })),
    raised: Math.max(0, target - total),
  };
}

function sampleRows(reports, total) {
  const strata = [];
  for (const rep of reports) {
    for (const type of TYPES) {
      const items = rep.served.filter((e) => e.type === type);
      strata.push({ key: `${rep.id}:${type}`, deck: rep.id, type, items });
    }
  }
  const { plan, raised } = allocate(strata, total);
  const rows = [];
  for (const { stratum, n } of plan) {
    for (const e of seededShuffle(stratum.items, stratum.key).slice(0, n)) {
      rows.push({
        deck: stratum.deck,
        from: e.from,
        to: e.to,
        gap: e.gap,
        fromTitle: e.fromTitle,
        toTitle: e.toTitle,
        stored_type: e.type,
        rationale: e.rationale,
      });
    }
  }
  return { rows, raised };
}

// ---------------------------------------------------------------------
// Cohen's kappa over two human passes, read back from the coding sheet.
// ---------------------------------------------------------------------
function readPass(file, colName) {
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error(`${file} is empty`);
  const header = splitCsv(lines[0]).map((h) => h.trim().toLowerCase());
  const iDeck = header.indexOf("deck");
  const iFrom = header.indexOf("from");
  const iTo = header.indexOf("to");
  const iKey = iDeck >= 0 ? iDeck : 0;
  const iF = iFrom >= 0 ? iFrom : 1;
  const iT = iTo >= 0 ? iTo : 2;
  const col = header.indexOf(colName.toLowerCase());
  if (col < 0) throw new Error(`${file} has no "${colName}" column — use a worksheet from --sample`);
  const map = new Map();
  for (const line of lines.slice(1)) {
    const cells = splitCsv(line);
    const key = [cells[iKey], cells[iF], cells[iT]].join(" ");
    const label = (cells[col] || "").trim();
    if (label) map.set(key, label);
  }
  return map;
}

function splitCsv(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function cohenKappa(a, b) {
  const keys = [];
  for (const k of a.keys()) if (b.has(k)) keys.push(k);
  if (!keys.length) return { n: 0, kappa: null };
  const n = keys.length;
  let agree = 0;
  const cats = new Set();
  for (const k of keys) { cats.add(a.get(k)); cats.add(b.get(k)); if (a.get(k) === b.get(k)) agree++; }
  const po = agree / n;
  const ca = new Map(), cb = new Map();
  for (const k of keys) {
    ca.set(a.get(k), (ca.get(a.get(k)) || 0) + 1);
    cb.set(b.get(k), (cb.get(b.get(k)) || 0) + 1);
  }
  const pe = [...cats].reduce((s, c) => s + ((ca.get(c) || 0) / n) * ((cb.get(c) || 0) / n), 0);
  return { n, po, pe, kappa: pe === 1 ? 1 : (po - pe) / (1 - pe) };
}

function kappaBand(k) {
  if (k === null) return "no comparable rows";
  if (k >= 0.8) return "strong";
  if (k >= 0.6) return "acceptable";
  if (k >= 0.4) return "fair";
  if (k >= 0.2) return "slight";
  return "poor";
}

// ---------------------------------------------------------------------
function main(argv) {
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const only = flag("--deck");

  if (!existsSync(join(REPO_ROOT, "connections.js"))) throw new Error("connections.js is missing");
  vm.runInThisContext(readFileSync(join(REPO_ROOT, "connections.js"), "utf8"), {
    filename: join(REPO_ROOT, "connections.js"),
  });
  if (!globalThis.Connections) throw new Error("connections.js did not define window.Connections");

  const paths = deckPaths().filter((p) => !only || p.id === only);
  if (!paths.length) throw new Error(`no deck matches --deck ${only}`);
  const reports = paths.map((p) => collect(p.path));

  if (argv.includes("--sample")) {
    const total = Number(flag("--sample")) || 30;
    const blind = argv.includes("--blind");
    const { rows, raised } = sampleRows(reports, total);
    const out = flag("--out");
    const header = "deck,from,to,gap,from_title,to_title,stored_type,rationale,coder_a_type,coder_b_type";
    const body = rows
      .map((r) =>
        [r.deck, r.from, r.to, r.gap, r.fromTitle, r.toTitle, blind ? "" : r.stored_type, r.rationale, "", ""]
          .map((cell) => {
            const s = cell === null || cell === undefined ? "" : String(cell);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(",")
      )
      .join("\n");
    const csv = `${header}\n${body}\n`;
    if (raised) {
      console.log(
        `budget raised from ${total} to ${rows.length}: every non-empty deck:type stratum keeps at least one seat, so a type cannot vanish from the sample`
      );
    }
    if (out) {
      writeFileSync(out, csv);
      console.log(`wrote ${rows.length} sampled edges -> ${out}`);
    } else {
      process.stdout.write(csv);
    }
    console.log(
      blind
        ? `BLIND sheet: stored_type is blank on purpose. Two independent passes over these ${rows.length} rows, each coder filling one coder_*_type column, then: node scripts/audit-connections.mjs --kappa <passA.csv> <passB.csv>`
        : `two independent passes over these ${rows.length} rows, then: node scripts/audit-connections.mjs --kappa <passA.csv> <passB.csv>. Use --blind for a kappa pass: a coder who can see stored_type anchors on it, and two anchored coders agree for the wrong reason.`
    );
    return 0;
  }

  if (argv.includes("--kappa")) {
    const files = argv.filter((a) => a.endsWith(".csv"));
    if (files.length !== 2) {
      console.error("usage: --kappa <passA.csv> <passB.csv>");
      return 2;
    }
    const [fa, fb] = files;
    const k = cohenKappa(readPass(fa, "coder_a_type"), readPass(fb, "coder_b_type"));
    if (!k.n) {
      console.error("no comparable rows: both files must be the same worksheet with a coding pass filled in");
      return 2;
    }
    console.log(`Cohen's kappa over n=${k.n} edges`);
    console.log(`  observed agreement  po = ${k.po.toFixed(3)}`);
    console.log(`  chance agreement    pe = ${k.pe.toFixed(3)}`);
    console.log(`  kappa                 = ${k.kappa.toFixed(3)}  (${kappaBand(k.kappa)})`);
    console.log(
      "\nBands: >=0.80 strong, >=0.60 acceptable, 0.40-0.60 fair, 0.20-0.40 slight, <0.20 poor."
    );
    console.log(
      `SCREEN, NOT A VERDICT: at n=${k.n} (protocol: 30, doc/CONNECTIONS.md §10) small-sample kappa is unreliable — treat it as grounds to decide whether to re-type, never as a claim of instrument validity.`
    );
    return 0;
  }

  // ---- report -----------------------------------------------------------
  const json = argv.includes("--json");
  const summary = [];
  let flagged = 0;
  let authoredTotal = 0;
  let servedTotal = 0;

  const lines = [];
  lines.push("connection audit — doc/CONNECTIONS.md §3 codebook applied as a SCREEN, not a verdict");
  lines.push("");

  for (const rep of reports) {
    authoredTotal += rep.authored;
    servedTotal += rep.served.length;
    const byType = new Map(TYPES.map((t) => [t, 0]));
    for (const e of rep.served) byType.set(e.type, byType.get(e.type) + 1);
    const total = rep.served.length;
    const rowsOut = TYPES.filter((t) => byType.get(t) > 0).map((t) => ({
      type: t,
      n: byType.get(t),
      share: total ? byType.get(t) / total : 0,
    }));
    const modal = rowsOut.slice().sort((a, b) => b.n - a.n)[0] || null;
    const deckFlagged = [];
    for (const e of rep.served) {
      const findings = screenEdge(e, e.gap);
      if (findings.length) {
        flagged++;
        deckFlagged.push({ edge: e, findings });
      }
    }
    summary.push({
      deck: rep.id,
      events: rep.events,
      authored: rep.authored,
      served: total,
      dropped: rep.dropped.length,
      types: rowsOut,
      modal: modal ? { type: modal.type, share: modal.share } : null,
      skew: !!(modal && modal.share > SKEW_GUARD),
      findings: deckFlagged,
    });

    if (!json) {
      lines.push(`${rep.id}  (${rep.events} events, ${rep.authored} authored edges, ${total} served, ${rep.dropped.length} dropped by indexEdges)`);
      if (!total) {
        lines.push("  no served edges");
      } else {
        for (const r of rowsOut) {
          const bar = "#".repeat(Math.max(1, Math.round(r.share * 20)));
          const warn = r.share > SKEW_GUARD && r === modal ? "   <- over the 50% guard" : "";
          lines.push(`  ${r.type.padEnd(13)} ${String(r.n).padStart(3)}  ${(100 * r.share).toFixed(0).padStart(3)}%  ${bar}${warn}`);
        }
      }
      for (const d of rep.dropped) lines.push(`  dropped: ${d.from} -> ${d.to} (${d.reason})`);
      if (deckFlagged.length) {
        lines.push(`  screen: ${deckFlagged.length} edge(s) whose rationale contradicts its own type`);
        for (const f of deckFlagged) {
          lines.push(`    ${f.edge.from} -> ${f.edge.to}  [${f.edge.type}]  (${f.edge.fromTitle} -> ${f.edge.toTitle})`);
          for (const c of f.findings) lines.push(`      ${c.code}: ${c.why}`);
        }
      } else if (total) {
        lines.push("  screen: no edge flagged");
      }
      lines.push("");
    }
  }

  if (json) {
    console.log(JSON.stringify({ skewGuard: SKEW_GUARD, triggerMaxGap: TRIGGER_MAX_GAP, decks: summary, flagged, authoredTotal, servedTotal }, null, 2));
  } else {
    console.log(lines.join("\n"));
    console.log(
      `${flagged} of ${servedTotal} served edges flagged across ${reports.length} deck(s); ${authoredTotal} authored in total.`
    );
    console.log(
      "A flagged edge may still be correctly typed and an unflagged one may not be: this reads the authored prose, not the history. Use it to choose the sample (--sample 30) and to prioritise the human re-typing pass."
    );
  }
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  console.error(`audit-connections: could not run — ${err.message}`);
  process.exitCode = 1;
}
