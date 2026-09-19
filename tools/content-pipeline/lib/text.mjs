// text.mjs — shared segmentation. The renderer and the gate must agree on what a
// paragraph and a sentence are, so both use these.

export function paragraphs(text) {
  return String(text || "")
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// Intl.Segmenter beats a naive split on [.!?] — it keeps "U.S." and "2.3 million"
// intact — but it does NOT know "c." means *circa*, which our dates use constantly.
// Normalise that first, then segment.
const SEG = new Intl.Segmenter("en", { granularity: "sentence" });

// Node's ICU does not guard these — each would otherwise split a sentence in two
// ("Dr. Smith left." -> "Dr." / "Smith left."). Replace the period with a
// non-breaking sentinel so the segmenter sees one clause. Order matters: the
// dotted forms first.
const ABBREV = [
  [/\bB\.\s*C\.?/gi, "BC"], [/\bA\.\s*D\.?/gi, "AD"],
  [/\be\.\s*g\./gi, "eg"], [/\bi\.\s*e\./gi, "ie"],
  [/\bc\.\s*/gi, "circa "], [/\bca\.\s*/gi, "circa "],
  [/\b(Dr|Mr|Mrs|Ms|St|Mt|Gen|Col|Capt|Lt|Sgt|Rev|Hon|Prof|Jr|Sr|vs|etc|No|Fig|approx|est)\./g, "$1"],
];

export function sentences(text) {
  const t = String(text || "").trim();
  if (!t) return [];
  let n = t;
  for (const [re, to] of ABBREV) n = n.replace(re, to);
  return [...SEG.segment(n)].map((s) => s.segment.trim()).filter(Boolean);
}
