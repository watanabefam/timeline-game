import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildWikipediaSource,
  wikiTitleFromUrl,
  wikipediaPageUrl,
  wikipediaApiUrl,
  pinnedRevisions,
  driftFor,
} from "../lib/source.mjs";

describe("source record builder (pure)", () => {
  test("builds a registry-compatible record from a Wikipedia page", () => {
    const s = buildWikipediaSource({ title: "Penicillin", revid: 123456789 });
    assert.equal(s.url, "https://en.wikipedia.org/wiki/Penicillin");
    assert.equal(s.license, "CC-BY-SA-4.0");
    assert.equal(s.revision, "123456789");
    assert.equal(s.rights, "verified");
    assert.match(s.attribution, /CC BY-SA 4\.0/);
  });

  test("understands the registry source domain", () => {
    const s = buildWikipediaSource({ title: "Moon landing", revid: 1 });
    assert.equal(new URL(s.url).hostname, "en.wikipedia.org");
  });

  test("handles titles with spaces and punctuation", () => {
    assert.equal(
      wikipediaPageUrl("Storming of the Bastille"),
      "https://en.wikipedia.org/wiki/Storming_of_the_Bastille",
    );
    assert.equal(
      wikipediaApiUrl("Storming of the Bastille"),
      "https://en.wikipedia.org/api/rest_v1/page/summary/Storming_of_the_Bastille",
    );
  });

  test("extracts a title from a Wikipedia URL", () => {
    assert.equal(
      wikiTitleFromUrl("https://en.wikipedia.org/wiki/Great_Pyramid_of_Giza"),
      "Great Pyramid of Giza",
    );
    assert.equal(wikiTitleFromUrl("https://example.com/wiki/X"), null);
    assert.equal(wikiTitleFromUrl("not a url"), null);
  });

  test("throws without a title", () => {
    assert.throws(() => buildWikipediaSource({ revid: 1 }));
  });
});

describe("source drift", () => {
  test("collects pins from sources[] and from a lone source", () => {
    const deck = {
      events: [
        { id: "a", sources: [{ title: "Apollo 11", revision: "111", url: "https://en.wikipedia.org/wiki/Apollo_11", usedFor: "x" }] },
        { id: "b", source: { url: "https://en.wikipedia.org/wiki/Penicillin", revision: "222" } },
        { id: "c", sources: [{ title: "No revision", usedFor: "y" }] },
      ],
    };
    const pins = pinnedRevisions(deck);
    assert.deepEqual(pins.map((p) => p.event), ["a", "b"]);
    assert.equal(pins[1].title, "Penicillin"); // derived from the URL
    assert.equal(pins[1].pinned, "222");
  });

  test("driftFor classifies current / drifted / unknown", () => {
    const pin = { event: "a", title: "T", pinned: "111" };
    assert.equal(driftFor(pin, 111).status, "current");
    assert.equal(driftFor(pin, 999).status, "drifted");
    assert.equal(driftFor(pin, null).status, "unknown");
  });
});

describe("drafting brief", async () => {
  const { buildBrief, loadDevices } = await import("../lib/brief.mjs");
  const reg = loadDevices();

  test("carries the claims, device, and the forbidden moves that were real errors", () => {
    const b = buildBrief(
      {
        id: "e", title: "T", year: 1, format: "narrative", pointOfView: "third",
        claims: [{ id: "C001", text: "a claim", quote: "a quote" }],
        characters: ["Meryt"],
        sources: [{ author: "A", title: "W", publisher: "P" }],
      },
      reg,
    );
    assert.match(b, /C001/);
    assert.match(b, /"a quote"/);
    assert.match(b, /Forbidden moves/);
    assert.match(b, /Never assert an outcome the record does not support/);
    assert.match(b, /Never imply events the sources do not mention/);
    assert.match(b, /Meryt/);
    assert.match(b, /300.700 words/);
  });

  test("says so plainly when there are no claims", () => {
    const b = buildBrief({ id: "e", title: "T", format: "narrative" }, reg);
    assert.match(b, /must not assert/);
  });
});
