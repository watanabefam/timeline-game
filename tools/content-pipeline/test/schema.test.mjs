import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateDeckSchema, loadRegistry } from "../lib/schema.mjs";

const registry = loadRegistry();

describe("schema (Ajv, Draft 2020-12, strict)", () => {
  test("a well-formed deck validates", () => {
    const deck = {
      schemaVersion: 1,
      id: "ok",
      name: "OK",
      events: [{ id: "e1", title: "T", fact: "F" }],
    };
    assert.deepEqual(validateDeckSchema(deck), []);
  });

  test("missing required top-level field fails", () => {
    const errs = validateDeckSchema({ schemaVersion: 1, id: "x", name: "X" });
    assert.ok(errs.some((e) => e.keyword === "required" && /events/.test(e.message)));
  });

  test("unexpected property fails (additionalProperties: false)", () => {
    const errs = validateDeckSchema({
      schemaVersion: 1,
      id: "x",
      name: "X",
      events: [{ id: "e", title: "T", fact: "F", bogus: true }],
    });
    assert.ok(errs.some((e) => e.keyword === "additionalProperties"));
  });

  test("wrong type fails", () => {
    const errs = validateDeckSchema({
      schemaVersion: 1,
      id: "x",
      name: "X",
      events: [{ id: "e", title: "T", fact: "F", year: "not-a-number" }],
    });
    assert.ok(errs.some((e) => e.keyword === "type"));
  });

  test("source url format is enforced (ajv-formats is active)", () => {
    const errs = validateDeckSchema({
      schemaVersion: 1,
      id: "x",
      name: "X",
      events: [
        { id: "e", title: "T", fact: "F", source: { url: "not a url", license: "MIT" } },
      ],
    });
    assert.ok(errs.some((e) => e.keyword === "format"));
  });

  test("registry loads with a fail-closed default", () => {
    assert.equal(registry.unknownLicense, "forbidden");
  });
});
