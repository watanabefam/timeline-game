import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadRegistry } from "../lib/schema.mjs";
import { checkSource, resolveLicense } from "../lib/license.mjs";

const registry = loadRegistry();
const rules = (fs) => fs.map((f) => f.rule);

describe("license governance (deterministic, fail-closed)", () => {
  test("registered + allowed + no attribution needed → clean", () => {
    const f = checkSource(registry, {
      id: "x",
      source: { url: "https://www.wikidata.org/wiki/Q1", license: "CC0-1.0" },
    });
    assert.deepEqual(f, []);
  });

  test("registered + attribution present → clean", () => {
    const f = checkSource(registry, {
      id: "x",
      source: {
        url: "https://en.wikipedia.org/wiki/X",
        license: "CC-BY-SA-4.0",
        attribution: "Wikipedia contributors, 'X', CC BY-SA 4.0",
      },
    });
    assert.deepEqual(f, []);
  });

  test("unregistered domain is blocked", () => {
    const f = checkSource(registry, {
      id: "x",
      source: { url: "https://history-blog.example.com/a", license: "MIT", attribution: "a" },
    });
    assert.ok(rules(f).includes("SOURCE_UNREGISTERED"));
  });

  test("forbidden license is blocked", () => {
    const f = checkSource(registry, {
      id: "x",
      source: {
        url: "https://en.wikipedia.org/wiki/X",
        license: "CC-BY-NC-4.0",
        attribution: "a",
      },
    });
    assert.ok(rules(f).includes("LICENSE_FORBIDDEN"));
  });

  test("unknown license is blocked (fail-closed)", () => {
    const f = checkSource(registry, {
      id: "x",
      source: { url: "https://en.wikipedia.org/wiki/X", license: "WTFPL", attribution: "a" },
    });
    assert.ok(rules(f).includes("LICENSE_MISSING"));
  });

  test("attribution required but missing is blocked", () => {
    const f = checkSource(registry, {
      id: "x",
      source: { url: "https://en.wikipedia.org/wiki/X", license: "CC-BY-SA-4.0" },
    });
    assert.ok(rules(f).includes("ATTRIBUTION_MISSING"));
  });

  test("missing source is blocked", () => {
    const f = checkSource(registry, { id: "x" });
    assert.ok(rules(f).includes("SOURCE_MISSING"));
  });

  test("resolveLicense treats unknown as forbidden", () => {
    assert.equal(resolveLicense(registry, "Nope-1.0").category, "forbidden");
    assert.equal(resolveLicense(registry, "Nope-1.0").known, false);
  });
});
