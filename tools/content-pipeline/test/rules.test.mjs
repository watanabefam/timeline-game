import { test, describe } from "node:test";
import { sentences } from "../lib/text.mjs";
import { buildBrief, loadDevices } from "../lib/brief.mjs";
import assert from "node:assert/strict";
import {
  checkYearLeak,
  checkRedundancy,
  checkGrounding,
  checkReadability,
  checkClaims,
  checkStorySource,
  checkSources,
  checkChanged,
  checkStoryLength,
  checkStoryTrace,
  checkMetaOverlap,
  checkFieldTrace,
  checkDepth,
  checkSpine,
  checkExposition,
  checkStoryRelevance,
  checkStoryReadability,
  checkSentenceLength,
  eventDepth,
  fleschKincaidGrade,
} from "../lib/rules.mjs";

const rules = (fs) => fs.map((f) => f.rule);

describe("YEAR_LEAK", () => {
  test("flags a year in fact/why", () => {
    const f = checkYearLeak({ id: "e", fact: "In 1789 the Bastille fell.", why: "It mattered." });
    assert.ok(rules(f).includes("YEAR_LEAK"));
  });

  test("does not flag quantities or comma numbers", () => {
    const f = checkYearLeak({
      id: "e",
      fact: "About 600 million people watched.",
      why: "It stood for 3,800 years.",
    });
    assert.deepEqual(f, []);
  });
});

describe("LAYER_REDUNDANCY", () => {
  test("flags restated claims across layers", () => {
    const f = checkRedundancy({
      id: "e",
      fact: "Parisians stormed the Bastille prison in Paris.",
      why: "The Bastille prison was stormed by Parisians in Paris.",
    });
    assert.ok(rules(f).includes("LAYER_REDUNDANCY"));
  });

  test("distinct layers are clean", () => {
    const f = checkRedundancy({
      id: "e",
      fact: "A mould killed the bacteria around it.",
      why: "The first antibiotic changed medicine forever.",
    });
    assert.deepEqual(f, []);
  });

  test("ignores very short fields", () => {
    const f = checkRedundancy({ id: "e", fact: "Short.", why: "Short." });
    assert.deepEqual(f, []);
  });
});

describe("GROUNDING", () => {
  const source = "The pharaoh Khufu built the Great Pyramid at Giza in Egypt.";

  test("flags a proper noun absent from the source", () => {
    const f = checkGrounding({ id: "e", summary: "The work is at Zanzibar." }, source);
    assert.ok(rules(f).includes("GROUNDING"));
  });

  test("names present in the source pass", () => {
    const f = checkGrounding({ id: "e", summary: "It was built for Khufu." }, source);
    assert.deepEqual(f, []);
  });

  test("quoted names are matched without their quote marks", () => {
    const f = checkGrounding(
      { id: "e", summary: "Its finale is the 'Ode to Joy'." },
      "The final movement sets Schiller's Ode to Joy to music.",
    );
    assert.deepEqual(f, []);
  });

  // Mid-sentence, because a sentence-initial capital is not evidence of a name.
  test("declared invented characters are not grounding failures", () => {
    const f = checkGrounding(
      { id: "e", summary: "The jar was carried by Meryt.", characters: ["Meryt"] },
      "Workers carried water from the canal.",
    );
    assert.deepEqual(f, []);
  });

  test("an UNDECLARED invented name still fails grounding", () => {
    const f = checkGrounding(
      { id: "e", summary: "The jar was carried by Meryt." },
      "Workers carried water from the canal.",
    );
    assert.deepEqual(rules(f), ["GROUNDING"]);
  });

  test("possessives check as the base entity", () => {
    const f = checkGrounding(
      { id: "e", summary: "Merer's diary recorded the deliveries." },
      "In 2013, rolls of papyrus called the Diary of Merer were discovered.",
    );
    assert.deepEqual(f, []);
  });

  test("no source → grounding skipped", () => {
    assert.deepEqual(checkGrounding({ id: "e", summary: "Zanzibar." }, undefined), []);
  });
});

describe("READABILITY_BAND", () => {
  test("summary inside the band passes", () => {
    const f = checkReadability({
      id: "e",
      summary:
        "The Great Pyramid was built as a tomb for the pharaoh Khufu. Crews moved over two million stone blocks without wheels or any engines.",
    });
    assert.deepEqual(f, []);
  });

  test("dense, long-sentence summary is out of band", () => {
    const f = checkReadability({
      id: "e",
      summary:
        "Notwithstanding the fundamentally indeterminate historiographical characterisation of the constitutional implications, the subsequent institutional ramifications necessitated comprehensive reconsideration of the antecedent jurisprudential presuppositions.",
    });
    assert.ok(rules(f).includes("READABILITY_BAND"));
  });

  test("fleschKincaidGrade returns a finite number", () => {
    assert.ok(Number.isFinite(fleschKincaidGrade("A short sentence. Another one.")));
  });
});

describe("CLAIMS (no supporting span → no value)", () => {
  const source =
    "The Great Pyramid of Giza is the tomb of the pharaoh Khufu. Crews moved roughly 2.3 million blocks of stone.";

  test("grounded claims pass", () => {
    const f = checkClaims(
      {
        id: "e",
        claims: [
          { id: "C001", text: "tomb of Khufu", quote: "the tomb of the pharaoh Khufu" },
          { id: "C002", text: "2.3m blocks", quote: "roughly 2.3 million blocks" },
        ],
      },
      source,
    );
    assert.deepEqual(f, []);
  });

  test("a quote absent from the source blocks", () => {
    const f = checkClaims(
      { id: "e", claims: [{ id: "C003", text: "marble", quote: "built of solid marble" }] },
      source,
    );
    assert.deepEqual(rules(f), ["CLAIM_UNSUPPORTED"]);
  });

  test("a claim with no quote blocks", () => {
    const f = checkClaims({ id: "e", claims: [{ id: "C004", text: "something" }] }, source);
    assert.deepEqual(rules(f), ["CLAIM_NO_QUOTE"]);
  });

  test("rejects a duplicate claim id", () => {
    const f = checkClaims({ id: "e", claims: [{ id: "C001", text: "a", quote: "q" }, { id: "C001", text: "b", quote: "q" }] }, source);
    assert.ok(rules(f).includes("CLAIM_SHAPE"));
  });

  test("rejects an empty claim text", () => {
    const f = checkClaims({ id: "e", claims: [{ id: "C001", text: "  ", quote: "q" }] }, source);
    assert.ok(rules(f).includes("CLAIM_SHAPE"));
  });

  test("no claims is not an error", () => {
    assert.deepEqual(checkClaims({ id: "e" }, source), []);
  });
});

describe("STORY_SOURCE (disclosure)", () => {
  test("a story with any valid relationship passes", () => {
    for (const v of [
      "retold",
      "adapted",
      "abridged",
      "paraphrased",
      "summarised",
      "translated",
      "quoted",
      "invented",
      "original",
    ]) {
      assert.deepEqual(checkStorySource({ id: "e", story: "text", storySource: v }), []);
    }
  });

  test("a story with no relationship blocks (would ship unlabelled)", () => {
    assert.deepEqual(rules(checkStorySource({ id: "e", story: "text" })), ["STORY_SOURCE_MISSING"]);
  });

  test("an unrecognised relationship blocks", () => {
    assert.deepEqual(
      rules(checkStorySource({ id: "e", story: "text", storySource: "rewritten" })),
      ["STORY_SOURCE_MISSING"],
    );
  });

  test("no story → nothing to disclose", () => {
    assert.deepEqual(checkStorySource({ id: "e", summary: "text" }), []);
  });
});

describe("SOURCES (attribution)", () => {
  test("every source must say what it was used for", () => {
    assert.deepEqual(rules(checkSources({ id: "e" })), []);
    assert.deepEqual(
      rules(checkSources({ id: "e", sources: [{ title: "A", usedFor: "Background" }] })),
      [],
    );
    assert.deepEqual(
      rules(checkSources({ id: "e", sources: [{ title: "A" }] })),
      ["SOURCE_USEDFOR_MISSING"],
    );
    assert.deepEqual(
      rules(checkSources({ id: "e", sources: [{ title: "A" }, { title: "B", usedFor: "" }] })),
      ["SOURCE_USEDFOR_MISSING", "SOURCE_USEDFOR_MISSING"],
    );
  });
});

describe("CHANGED (CC modification notice)", () => {
  const adapted = (extra = {}) => ({
    id: "e",
    story: "text",
    storySource: "retold",
    sources: [{ title: "A", usedFor: "Background" }],
    ...extra,
  });

  test("an adapted story that describes its changes passes", () => {
    assert.deepEqual(checkChanged(adapted({ changed: "Shortened and simplified." })), []);
  });

  test("an adapted story with no changes note warns (not an error)", () => {
    const f = checkChanged(adapted());
    assert.deepEqual(rules(f), ["CHANGED_MISSING"]);
    assert.equal(f[0].severity, "warning");
  });

  test("our own writing needs no note", () => {
    assert.deepEqual(checkChanged(adapted({ storySource: "original" })), []);
  });

  test("a story with no sources needs no note", () => {
    assert.deepEqual(checkChanged({ id: "e", story: "text", storySource: "retold" }), []);
  });

  test("no story → nothing to note", () => {
    assert.deepEqual(checkChanged({ id: "e", summary: "text" }), []);
  });
});

describe("STORY_LENGTH", () => {
  const words = (n) => Array(n).fill("word").join(" ");

  test("a story in range passes", () => {
    assert.deepEqual(checkStoryLength({ id: "e", story: words(400) }), []);
  });

  test("a summary-length 'story' warns (not an error)", () => {
    const f = checkStoryLength({ id: "e", story: words(110) });
    assert.deepEqual(rules(f), ["STORY_LENGTH"]);
    assert.equal(f[0].severity, "warning");
  });

  test("an over-long story warns", () => {
    assert.deepEqual(rules(checkStoryLength({ id: "e", story: words(900) })), ["STORY_LENGTH"]);
  });

  test("no story → nothing to check", () => {
    assert.deepEqual(checkStoryLength({ id: "e" }), []);
  });
});

describe("STORY_TRACE (sentence-level)", () => {
  const claims = [{ id: "C001", text: "x", quote: "q" }];

  test("the unit is the SENTENCE, not the paragraph", () => {
    const story = "One. Two.\n\nThree.";   // 2 paragraphs, but 3 sentences
    const ok = checkStoryTrace({ id: "e", story, claims, storyTrace: [["C001"], ["C001"], []] });
    assert.deepEqual(rules(ok), ["STORY_TRACE_INVENTED"]);
    // a paragraph-shaped trace is now a count error — this is the whole point
    const bad = checkStoryTrace({ id: "e", story, claims, storyTrace: [["C001"], []] });
    assert.deepEqual(rules(bad), ["STORY_TRACE_COUNT"]);
    assert.equal(bad[0].severity, "error");
  });

  test("invented sentences are counted, not itemised — `[]` is the device", () => {
    const f = checkStoryTrace({ id: "e", story: "One. Two. Three.", claims, storyTrace: [[], [], []] });
    assert.deepEqual(rules(f), ["STORY_TRACE_INVENTED"]);
    assert.match(f[0].message, /3 of 3/);
  });

  test('"?" marks an assertion about the world with no claim behind it', () => {
    const f = checkStoryTrace({ id: "e", story: "One. Two.", claims, storyTrace: [["?"], []] });
    const un = f.filter((x) => x.rule === "STORY_TRACE_UNRESOLVED");
    assert.equal(un.length, 1);
    assert.equal(un[0].severity, "warning");
    assert.match(un[0].message, /unit 1/);
    assert.match(f.find((x) => x.rule === "STORY_TRACE_INVENTED").message, /1 unresolved/);
  });

  test("citing a claim that does not exist fails", () => {
    const f = checkStoryTrace({ id: "e", story: "One.", claims, storyTrace: [["C999"]] });
    assert.ok(rules(f).includes("STORY_TRACE_UNKNOWN_CLAIM"));
  });

  test("a cited claim with no source quote fails (story now matches fields)", () => {
    const f = checkStoryTrace({ id: "e", story: "One.", claims: [{ id: "C001", text: "x" }], storyTrace: [["C001"]] });
    assert.ok(rules(f).includes("STORY_TRACE_UNSUPPORTED_CLAIM"));
  });

  test("a story with no trace warns, and reports the unit count", () => {
    const f = checkStoryTrace({ id: "e", story: "One. Two.", claims });
    assert.deepEqual(rules(f), ["STORY_TRACE_MISSING"]);
    assert.match(f[0].message, /2 sentence/);
  });

  test("no story → nothing to trace", () => {
    assert.deepEqual(checkStoryTrace({ id: "e" }), []);
  });
});

describe("META_OVERLAP (changed vs storyNote)", () => {
  test("flags the duplicated pair it was written for", () => {
    const f = checkMetaOverlap({
      id: "e",
      changed: "Rewritten as an imagined scene for younger readers. The camp, the crews, the gang name and Merer's diary are from the record; Meryt and her day are invented.",
      storyNote: "The workers' camps, the crews of forty, the zau, the 'Overseer of Ten', the gang name and Merer's diary are all from the record. Meryt, her father and her day are invented.",
    });
    assert.deepEqual(rules(f), ["META_OVERLAP"]);
    assert.equal(f[0].severity, "warning");
  });

  test("passes when each field does its own job", () => {
    assert.deepEqual(
      checkMetaOverlap({
        id: "e",
        changed: "Rewritten as a short imagined scene for younger readers, and shortened. The wording, the order and the invented scene are ours.",
        storyNote: "The workers' camps, the crews of forty, the zau, the 'Overseer of Ten', the gang name and Merer's diary are from the record. Meryt, her father and her day are invented.",
      }),
      [],
    );
  });

  test("no-ops when either field is absent", () => {
    assert.deepEqual(checkMetaOverlap({ id: "e", changed: "x" }), []);
  });
});

describe("FIELD_TRACE", () => {
  const claims = [{ id: "C001", text: "a", quote: "q" }, { id: "C002", text: "b", quote: "q" }];
  const base = (extra) => ({ id: "e", claims, ...extra });

  test("one entry per sentence, multiple claims allowed", () => {
    const f = checkFieldTrace(base({
      fact: "One line.", why: "Another.", summary: "First sentence. Second sentence!",
      fieldTrace: { fact: [["C001"]], why: [["C002"]], summary: [["C001", "C002"], ["C002"]] },
    }));
    assert.deepEqual(rules(f), []);
  });

  test("count mismatch after punctuation is caught", () => {
    const f = checkFieldTrace(base({ summary: "One. Two.", fieldTrace: { summary: [["C001"]] } }));
    assert.ok(rules(f).includes("FIELD_TRACE_COUNT"));
  });

  test("abbreviations and decimals do not split sentences", () => {
    const f = checkFieldTrace({
      id: "e", claims,
      summary: "It is c. 2600 BC, weighing 2.3 million tonnes.",
      fieldTrace: { summary: [["C001"]] },
    });
    assert.ok(!rules(f).includes("FIELD_TRACE_COUNT"), JSON.stringify(rules(f)));
  });

  test("circa, initials and common abbreviations do not split sentences", () => {
    const one = (txt) => sentences(txt).length;
    assert.equal(one("It is c. 2600 BC, weighing 2.3 million tonnes."), 1);
    assert.equal(one("The U.S. was founded in 1776. It grew."), 2);
    assert.equal(one("Dr. Smith left. He returned."), 2);   // was 3 before the table
    assert.equal(one("In 44 B.C. Caesar died. Rome mourned."), 2);
    assert.equal(one("No. 5 was found, e.g. in the mortar. It dated."), 2);
  });

  test("unknown claim id fails", () => {
    const f = checkFieldTrace(base({ fact: "x", fieldTrace: { fact: [["C999"]] } }));
    assert.ok(rules(f).includes("FIELD_TRACE_UNKNOWN_CLAIM"));
  });

  test("duplicate id within one unit fails", () => {
    const f = checkFieldTrace(base({ fact: "x", fieldTrace: { fact: [["C001", "C001"]] } }));
    assert.ok(rules(f).includes("FIELD_TRACE_DUPLICATE_CLAIM"));
  });

  test("a claim with no quote fails", () => {
    const f = checkFieldTrace({ id: "e", fact: "x", claims: [{ id: "C001", text: "a" }], fieldTrace: { fact: [["C001"]] } });
    assert.ok(rules(f).includes("FIELD_TRACE_UNSUPPORTED_CLAIM"));
  });

  test("an empty entry is info, not an error", () => {
    const f = checkFieldTrace(base({ fact: "x", fieldTrace: { fact: [[]] } }));
    assert.deepEqual(rules(f), ["FIELD_TRACE_EMPTY"]);
    assert.equal(f[0].severity, "info");
  });

  test("missing trace is an error for new content, warning when grandfathered", () => {
    assert.equal(checkFieldTrace(base({ fact: "x" }))[0].severity, "error");
    assert.equal(checkFieldTrace(base({ fact: "x" }), { grandfathered: true })[0].severity, "warning");
    assert.deepEqual(checkFieldTrace(base({ fact: "x" })).length > 0, true);
  });
});

describe("DEPTH", () => {
  test("derived from content, never stored", () => {
    assert.equal(eventDepth({ id: "a", story: "Once. Twice." }), "deep");
    assert.equal(eventDepth({ id: "b", summary: "A short paragraph." }), "shallow");
    assert.equal(eventDepth({ id: "c", fact: "x", why: "y" }), "fact-only");
  });

  test("whitespace-only story/summary do not count as a tier", () => {
    assert.equal(eventDepth({ id: "a", story: "   ", summary: "Real." }), "shallow");
    assert.equal(eventDepth({ id: "b", summary: "  " }), "fact-only");
  });

  test("a stored depth field is ignored — the content decides", () => {
    // even if someone writes depth:"deep", no story means shallow
    assert.equal(eventDepth({ id: "a", depth: "deep", summary: "Real." }), "shallow");
  });

  test("only shallow events are flagged, and only at info", () => {
    assert.deepEqual(checkDepth({ id: "a", story: "Once." }), []);
    assert.deepEqual(checkDepth({ id: "c", fact: "x" }), []);
    const f = checkDepth({ id: "b", summary: "A paragraph." });
    assert.equal(f.length, 1);
    assert.equal(f[0].rule, "DEPTH_SHALLOW");
    assert.equal(f[0].severity, "info");
  });
});

describe("SPINE", () => {
  const beat = { want: "water", obstacle: "heat", turn: "not yet found", outcome: "delivered" };

  test("a story without a spine is flagged for review", () => {
    const f = checkSpine({ id: "e", story: "Once." });
    assert.deepEqual(f.map((x) => x.rule), ["SPINE_MISSING"]);
    assert.equal(f[0].severity, "warning");
  });

  test("a complete spine passes", () => {
    assert.deepEqual(checkSpine({ id: "e", story: "Once.", storySpine: beat }), []);
  });

  test("each beat must be a non-empty string", () => {
    for (const k of ["want", "obstacle", "turn", "outcome"]) {
      const f = checkSpine({ id: "e", story: "Once.", storySpine: { ...beat, [k]: "  " } });
      assert.deepEqual(f.map((x) => x.rule), ["SPINE_SHAPE"], k);
      assert.ok(f[0].message.includes(k));
    }
    assert.deepEqual(checkSpine({ id: "e", story: "Once.", storySpine: 42 }).map((x) => x.rule), ["SPINE_SHAPE"]);
  });

  test("no story and no spine is not a finding", () => {
    assert.deepEqual(checkSpine({ id: "e", fact: "x" }), []);
  });

  test("a spine with no story is info, not an error", () => {
    const f = checkSpine({ id: "e", fact: "x", storySpine: beat });
    assert.deepEqual(f.map((x) => x.rule), ["SPINE_UNUSED"]);
    assert.equal(f[0].severity, "info");
  });
});

describe("brief", () => {
  test("carries the spine, the settleable-stake policy, and the facts", () => {
    const reg = loadDevices();
    const md = buildBrief({
      id: "e", title: "T", year: 1, format: "narrative", pointOfView: "third",
      characters: ["X"], claims: [{ id: "C001", text: "t", quote: "q" }],
    }, reg);
    assert.match(md, /## The spine — the goal-directed episode/);
    assert.match(md, /\*\*Want:\*\*/);
    assert.match(md, /Choose a stake the scene can settle/);
    assert.ok(reg.universalRules.some((r) => /only the future can settle/.test(r)), "policy must be a universal rule");
    assert.match(md, /only the future can settle/);   // ...and therefore printed in the brief
  });

  test("renders declared beats instead of prompts", () => {
    const reg = loadDevices();
    const md = buildBrief({
      id: "e", title: "T", storySpine: { want: "W", obstacle: "O", turn: "T", outcome: "U" },
    }, reg);
    assert.match(md, /\*\*Want:\*\* W/);
    assert.ok(!md.includes("(what does the protagonist want"));
  });
});

describe("trace parity: story and fields share one validator", () => {
  test("an invented unit is itemised in a FIELD but only counted in a STORY", () => {
    const claims = [{ id: "C001", text: "x", quote: "q" }];
    const field = checkFieldTrace({ id: "e", claims, summary: "One. Two.", fieldTrace: { summary: [[], ["C001"]] } });
    assert.ok(rules(field).includes("FIELD_TRACE_EMPTY"), "expository `[]` is unusual → flagged");
    const story = checkStoryTrace({ id: "e", claims, story: "One. Two.", storyTrace: [[], ["C001"]] });
    assert.ok(!rules(story).includes("STORY_TRACE_EMPTY"), "narrative `[]` is the device → counted only");
  });

  test('"?" works on fields too, and is a warning', () => {
    const claims = [{ id: "C001", text: "x", quote: "q" }];
    const f = checkFieldTrace({ id: "e", claims, summary: "One.", fieldTrace: { summary: [["?"]] } });
    const un = f.filter((x) => x.rule === "FIELD_TRACE_UNRESOLVED");
    assert.equal(un.length, 1);
    assert.equal(un[0].severity, "warning");
  });
});

describe("EXPOSITION (ESSAY_BLOCK / EXPOSITION_DRIFT)", () => {
  // >45 words, purely abstract: no actor, no sensory token, no action verb
  const abstract = "The significance of the monument lies in its demonstration of the state capacity of the Old Kingdom and the administrative apparatus that supported it. Its wider importance is the evidence it provides for the organisation of labour, the redistribution of agricultural surplus, and the ideological function of monumental construction in legitimating royal authority throughout the period.";

  test("our own pronoun-led narrative passes", () => {
    const para = "She found the gang in the end, on the far side of the wall. The water went round and came back empty. Standing with her back against the stone she could not see the top of it. The pyramid had been rising for years, and would go on for twenty-six, longer than her whole life so far.";
    assert.deepEqual(checkExposition({ id: "e", story: para, characters: ["Meryt"] }), []);
  });

  test("a genuine abstract block is flagged, as a warning", () => {
    const f = checkExposition({ id: "e", story: abstract, characters: ["Meryt"] });
    assert.deepEqual(f.map((x) => x.rule), ["ESSAY_BLOCK"]);
    assert.equal(f[0].severity, "warning");
  });

  test("a declared cast gives pronouns a referent — without one, they do not count", () => {
    // pronoun + the abstract text: no NAME, no sensory token, no action verb.
    // The only thing that can save it is the pronoun/cast rule.
    const block = "She considered it carefully and at length. " + abstract;
    assert.deepEqual(checkExposition({ id: "e", story: block, characters: ["Meryt"] }), []);
    assert.deepEqual(
      checkExposition({ id: "e", story: block, characters: [] }).map((x) => x.rule),
      ["ESSAY_BLOCK"],
    );
  });

  test("a named actor saves a block outright — single-word names included", () => {
    // their extractor needed TWO capitalised words, so "Meryt" was invisible to it
    const block = abstract.replace("The significance", "Meryt considered the significance");
    assert.deepEqual(checkExposition({ id: "e", story: block, characters: ["Meryt"] }), []);
  });

  test("short blocks are skipped — a block cannot be an essay at that length", () => {
    assert.deepEqual(checkExposition({ id: "e", story: "The significance was considerable.", characters: [] }), []);
  });

  test("consecutive exposition blocks drift", () => {
    const f = checkExposition({ id: "e", story: [abstract, abstract, abstract, abstract].join("\n\n"), characters: ["Meryt"] });
    assert.ok(f.some((x) => x.rule === "EXPOSITION_DRIFT"), JSON.stringify(rules(f)));
    assert.ok(f.filter((x) => x.rule === "ESSAY_BLOCK").length <= 5, "flagging is capped");
  });

  test("no story → nothing to check", () => {
    assert.deepEqual(checkExposition({ id: "e" }), []);
  });
});

describe("STORY_READABILITY", () => {
  const story = "Meryt carried the jar up the ramp. The stone was cool under her feet. The crews were already working.";

  test("inside the band passes; outside warns", () => {
    assert.deepEqual(checkStoryReadability({ id: "e", story }, { min: 1, max: 20 }), []);
    const f = checkStoryReadability({ id: "e", story }, { min: 10, max: 20 });
    assert.deepEqual(f.map((x) => x.rule), ["STORY_READABILITY"]);
    assert.equal(f[0].severity, "warning");
    assert.ok(typeof f[0].grade === "number" || typeof f[0].details?.grade === "number");
  });

  test("no story → nothing to grade", () => {
    assert.deepEqual(checkStoryReadability({ id: "e" }), []);
    assert.deepEqual(checkStoryReadability({ id: "e", story: "   " }), []);
  });
});

describe("SENTENCE_OVER_LIMIT / SENTENCE_AVG_HIGH", () => {
  const short = "She walked. She waited. She looked.";
  // NB: sentences must START with a capital or ICU will not break them (its
  // abbreviation guard), which is exactly how real prose behaves.
  const s22 = "Alpha " + Array(21).fill("word").join(" ") + ".";   // 22 words
  const outlier = short + " Beta " + Array(34).fill("word").join(" ") + ".";  // 35-word outlier

  test("an outlier is caught even when the AVERAGE is fine — the thing FK cannot do", () => {
    const f = checkSentenceLength({ id: "e", story: outlier });
    assert.deepEqual(f.map((x) => x.rule), ["SENTENCE_OVER_LIMIT"]);
    assert.equal(f[0].severity, "warning");
    assert.match(f[0].message, /35 words/);
  });

  test("the finding carries an excerpt for the reviewer", () => {
    const f = checkSentenceLength({ id: "e", story: outlier });
    assert.ok(String(JSON.stringify(f[0])).includes("word word"), "excerpt should be attached");
  });

  test("a high across-the-board average warns separately", () => {
    const flat = Array.from({ length: 5 }, (_, i) => `Alpha${i} ` + Array(21).fill("word").join(" ") + ".").join(" ");
    const f = checkSentenceLength({ id: "e", story: flat });
    assert.deepEqual(f.map((x) => x.rule), ["SENTENCE_AVG_HIGH"]);
    assert.match(f[0].message, /averages 22\.0/);
  });

  test("plain short prose passes both", () => {
    assert.deepEqual(checkSentenceLength({ id: "e", story: short }), []);
  });

  test("no story → nothing to measure", () => {
    assert.deepEqual(checkSentenceLength({ id: "e" }), []);
  });
});

describe("STORY_OFF_EVENT (is the story about this event?)", () => {
  const claims = [{ id: "C001", text: "a", quote: "q" }, { id: "C002", text: "b", quote: "q" }];
  const base = (extra) => ({ id: "e", story: "One. Two.", claims, identityClaims: ["C001"], ...extra });

  test("a story citing the identity claim passes", () => {
    assert.deepEqual(checkStoryRelevance(base({ storyTrace: [["C001"], []] })), []);
  });

  test("a story citing only context claims is flagged", () => {
    const f = checkStoryRelevance(base({ storyTrace: [[], ["C002"]] }));
    assert.deepEqual(f.map((x) => x.rule), ["STORY_OFF_EVENT"]);
    assert.equal(f[0].severity, "warning");
    assert.match(f[0].message, /C001/);
  });

  test('an unresolved ["?"] does not count as citing the identity claim', () => {
    const f = checkStoryRelevance(base({ storyTrace: [["?"], []] }));
    assert.ok(f.some((x) => x.rule === "STORY_OFF_EVENT"));
  });

  test("a story-bearing event must declare identityClaims", () => {
    const f = checkStoryRelevance({ id: "e", story: "One.", claims, storyTrace: [["C001"]] });
    assert.deepEqual(f.map((x) => x.rule), ["IDENTITY_CLAIMS_MISSING"]);
    assert.equal(f[0].severity, "warning");
  });

  test("an unknown identity claim is an error", () => {
    const f = checkStoryRelevance(base({ identityClaims: ["C999"], storyTrace: [["C001"]] }));
    assert.ok(f.some((x) => x.rule === "IDENTITY_CLAIM_UNKNOWN" && x.severity === "error"));
  });

  test("identity absent from `fact` is info — the fact/why drift signal", () => {
    const f = checkStoryRelevance(base({
      storyTrace: [["C001"]], fieldTrace: { fact: [["C002"]] },
    }));
    const info = f.filter((x) => x.rule === "IDENTITY_NOT_IN_FACT");
    assert.equal(info.length, 1);
    assert.equal(info[0].severity, "info");
  });

  test("matching fact and identity produce nothing", () => {
    assert.deepEqual(checkStoryRelevance(base({ storyTrace: [["C001"]], fieldTrace: { fact: [["C001"]] } })), []);
  });

  test("no story, or no claims → nothing to judge", () => {
    assert.deepEqual(checkStoryRelevance({ id: "e" }), []);
    assert.deepEqual(checkStoryRelevance({ id: "e", story: "One." }), []);
  });
});
