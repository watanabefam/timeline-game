import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "..", "verify.mjs");
const FIX = join(here, "fixtures");

function run(args) {
  try {
    const out = execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout || "") + (e.stderr || "") };
  }
}

describe("verify CLI (end-to-end)", () => {
  test("valid deck + sources → exit 0, PASS", () => {
    const r = run([join(FIX, "valid.deck.json"), "--sources", join(FIX, "sources")]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /PASS/);
  });

  test("broken deck → exit 1 with the expected rule set", () => {
    const r = run([join(FIX, "broken.deck.json"), "--format", "json"]);
    assert.equal(r.code, 1, r.out);
    const j = JSON.parse(r.out);
    const got = new Set(j.findings.map((f) => f.rule));
    for (const rule of [
      "SOURCE_UNREGISTERED",
      "LICENSE_FORBIDDEN",
      "ATTRIBUTION_MISSING",
      "YEAR_LEAK",
      "LAYER_REDUNDANCY",
    ]) {
      assert.ok(got.has(rule), `expected ${rule} in ${[...got].join(", ")}`);
    }
    assert.ok(j.summary.errors >= 3, "expected >=3 errors");
  });

  test("fail-level gate: warnings pass by default, fail when escalated", () => {
    const strict = run([join(FIX, "warnings.deck.json"), "--format", "json"]);
    assert.equal(strict.code, 0, "warnings alone should not fail at --fail-level error");
    assert.ok(JSON.parse(strict.out).summary.warnings >= 1);

    const escalated = run([join(FIX, "warnings.deck.json"), "--fail-level", "warning"]);
    assert.equal(escalated.code, 1, "--fail-level warning should fail on warnings");
  });

  test("explain prints rule guidance", () => {
    const r = run(["explain", "LICENSE_FORBIDDEN"]);
    assert.equal(r.code, 0);
    assert.match(r.out, /forbidden licenses cannot ship/);
  });

  test("draft with an unsupported claim → exit 1 (CLAIM_UNSUPPORTED)", () => {
    const r = run([join(FIX, "draft.deck.json"), "--sources", join(FIX, "sources"), "--format", "json"]);
    assert.equal(r.code, 1, r.out);
    const got = new Set(JSON.parse(r.out).findings.map((f) => f.rule));
    assert.ok(got.has("CLAIM_UNSUPPORTED"), `expected CLAIM_UNSUPPORTED in ${[...got].join(", ")}`);
  });

  test("bad usage → exit 2", () => {
    assert.equal(run([]).code, 2);
    assert.equal(run(["--nope"]).code, 2);
    assert.equal(run([join(FIX, "valid.deck.json"), "--fail-level", "bogus"]).code, 2);
  });
});
