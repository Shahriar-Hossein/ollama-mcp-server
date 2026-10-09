import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { validateLanguageFixture, type LanguageFixture } from "./language-eval-fixture.js";

const manifestPath = resolve("docs/experimental/benchmarks/runs/2026-10-09-language-eval.json");
const sourcePath = resolve("scripts/experimental/fixtures/language-eval/source");
const fixture = JSON.parse(readFileSync(manifestPath, "utf8")) as LanguageFixture;

test("frozen language fixture validates all source lines and hashes", () => {
  assert.doesNotThrow(() => validateLanguageFixture(fixture, sourcePath));
});

test("fixture validation rejects a changed source file", () => {
  const root = mkdtempSync(join(tmpdir(), "language-fixture-"));
  try {
    cpSync(sourcePath, root, { recursive: true });
    writeFileSync(join(root, "go/worker.go"), "package main\n// changed\n");
    assert.throws(() => validateLanguageFixture(fixture, root), /Frozen source changed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fixture validation rejects rubric drift, duplicate IDs, and escaped paths", () => {
  const wrongLine = structuredClone(fixture);
  wrongLine.questions[0].required[0].text += " changed";
  assert.throws(() => validateLanguageFixture(wrongLine, sourcePath), /Required source line mismatch/);

  const duplicate = structuredClone(fixture);
  duplicate.questions[1].id = duplicate.questions[0].id;
  assert.throws(() => validateLanguageFixture(duplicate, sourcePath), /duplicate question ID/);

  const escaped = structuredClone(fixture);
  escaped.questions[0].required[0].file = "../outside.php";
  assert.throws(() => validateLanguageFixture(escaped, sourcePath), /escapes fixture root/);
});

test("fixture validation rejects missing language coverage", () => {
  const wrongDistribution = structuredClone(fixture);
  wrongDistribution.questions[0].language = "rust";
  assert.throws(() => validateLanguageFixture(wrongDistribution, sourcePath), /php question count/);
});
