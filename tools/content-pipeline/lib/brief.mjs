// brief.mjs — the drafting brief: what the drafter is told BEFORE it writes.
//
// Our gate grades a *finished* story; by then an authoring error has already been
// made, and three of them were. history-tales runs its guardrails between outline
// and script generation and feeds the findings INTO the generation prompt — the
// control point is *before* drafting. This is that brief: the claims with their
// verbatim quotes (the only facts that may be asserted), the device, the point of
// view, the length target, and the forbidden moves.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const DEVICES_PATH = join(here, "..", "registry", "devices.json");

export function loadDevices(path = DEVICES_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function buildBrief(e, reg) {
  const deviceId = e.format || "narrative";
  const device = reg.devices[deviceId] || reg.devices.narrative;
  const claims = Array.isArray(e.claims) ? e.claims : [];
  const out = [];

  out.push(`# Drafting brief — ${e.title}${e.year != null ? ` (${e.year})` : ""}`);
  out.push("");
  out.push(`**Device:** ${deviceId} — ${device.description}`);
  out.push(`**Point of view:** ${e.pointOfView || "third"}`);
  out.push("**Length:** 300–700 words. Write a scene, not a summary.");
  if (Array.isArray(e.characters) && e.characters.length) {
    out.push(`**Invented cast** (declare these; add no others): ${e.characters.join(", ")}`);
  }
  out.push("`details` is the reference layer: denser is fine, it is not age-banded. The `story` is.");

  // The spine comes before the facts on purpose: this is the control point. The
  // failure it prevents is a story that is a sequence of scenes ("and then…"),
  // which reads as directionless however good the detail is.
  out.push("");
  out.push("## The spine — the goal-directed episode");
  out.push("");
  out.push("Name these four beats BEFORE you write. A story is a character who wants");
  out.push("something, meets an obstacle, is turned, and ends somewhere changed.");
  out.push("Every target fact must sit ON this chain — facts that merely decorate it are");
  out.push("seductive details, and measurably reduce learning.");
  out.push("");
  const sp = e.storySpine;
  if (sp && typeof sp === "object" && !Array.isArray(sp)) {
    for (const k of ["want", "obstacle", "turn", "outcome"]) {
      out.push(`- **${k[0].toUpperCase() + k.slice(1)}:** ${sp[k]}`);
    }
  } else {
    out.push("- **Want:** (what does the protagonist want, here, now?)");
    out.push("- **Obstacle:** (what stands in the way?)");
    out.push('- **Turn:** (what changes? the "but" — not another "and then")');
    out.push("- **Outcome:** (how does it resolve, and what changed?)");
  }
  out.push("");
  out.push("**Choose a stake the scene can settle.** A want about the *present* resolves");
  out.push("inside the scene and needs nothing the record lacks. A want about the");
  out.push("*future* — what became of them, whether they lived to see it — requires the");
  out.push("narrator to know what no source says. That is where omniscience enters.");

  out.push("");
  out.push("## What is true — the only facts you may assert");
  if (!claims.length) {
    out.push("_No claims: this story must not assert any fact about the world._");
  }
  for (const c of claims) {
    out.push(`- **${c.id}** — ${c.text}`);
    if (c.quote) out.push(`  > "${c.quote}"`);
  }

  out.push("");
  out.push("## Forbidden moves — failure modes we have hit, and policies we hold");
  for (const r of reg.universalRules) out.push(`- ${r}`);
  for (const m of device.forbiddenMoves || []) out.push(`- ${m}`);

  out.push("");
  out.push("## Sources to look for");
  for (const s of device.preferredSources || []) out.push(`- ${s}`);

  if (Array.isArray(e.sources) && e.sources.length) {
    out.push("");
    out.push("## Sources actually used");
    for (const s of e.sources) {
      const who = s.author ? `${s.author}, ` : "";
      out.push(`- ${who}${s.title}${s.publisher ? ` (${s.publisher})` : ""}`);
    }
  }

  out.push("");
  out.push(
    `## The split\nDocumented paragraphs cite claims; invented paragraphs use \`[]\`. ` +
      `At least one paragraph must be documented for every one you invent.`,
  );
  return out.join("\n") + "\n";
}
