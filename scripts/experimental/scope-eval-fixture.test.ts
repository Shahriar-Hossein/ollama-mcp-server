import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { validateScopeFixture, type ScopeFixture } from "./scope-eval-fixture.js";

const source = resolve("scripts/experimental/fixtures/scope-eval/source");
const fixture = JSON.parse(readFileSync(resolve(
  "docs/experimental/benchmarks/runs/2026-10-09-scope-eval.json"), "utf8")) as ScopeFixture;

test("frozen scope sources and exact required lines validate", () => {
  validateScopeFixture(fixture, source);
});

test("source mutations and extra files invalidate the freeze", () => {
  const root = mkdtempSync(join(tmpdir(), "scope-fixture-"));
  try {
    cpSync(source, root, { recursive: true });
    writeFileSync(join(root, "python/scopes.py"), "DEFAULTS = {}\n");
    assert.throws(() => validateScopeFixture(fixture, root), /Frozen source changed/);
    cpSync(source, root, { recursive: true });
    writeFileSync(join(root, "extra.py"), "x = 1\n");
    assert.throws(() => validateScopeFixture(fixture, root), /Source file set/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects line drift, duplicate tuples and IDs, unsafe paths and wrong counts", () => {
  for (const [mutate, error] of [
    [(f: ScopeFixture) => { f.questions[0].required[0].line++; }, /line mismatch/],
    [(f: ScopeFixture) => { f.questions[0].required.push(f.questions[0].required[0]); }, /Duplicate required tuple/],
    [(f: ScopeFixture) => { f.questions[1].id = f.questions[0].id; }, /duplicate question ID/],
    [(f: ScopeFixture) => { f.questions[0].required[0].file = "../outside.py"; }, /Unsafe or unknown/],
    [(f: ScopeFixture) => { f.questions.pop(); }, /exactly 4/],
    [(f: ScopeFixture) => { f.questions[0].language = "php"; }, /language mismatch/],
    [(f: ScopeFixture) => { f.questions[0].language = "php"; f.questions[0].required = f.questions[2].required; }, /2\/2/],
  ] as const) {
    const changed = structuredClone(fixture);
    mutate(changed);
    assert.throws(() => validateScopeFixture(changed, source), error);
  }
});

test("paired values and declaration citations isolate neighboring scopes", () => {
  const [local, shared, primary, secondary] = fixture.questions;
  assert.deepEqual(local.required.map((ref) => ref.line), [7, 8, 9, 10, 12]);
  assert.deepEqual(shared.required.map((ref) => ref.line), [1, 2, 3, 15, 16]);
  assert.deepEqual(primary.required.map((ref) => ref.line), [2, 3, 4, 5, 7]);
  assert.deepEqual(secondary.required.map((ref) => ref.line), [10, 11, 12, 13, 15]);
  for (const question of fixture.questions) assert.equal(question.forbidden_claims.length, 1);
});

test("source-only Git target permits .git metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "scope-git-fixture-"));
  try {
    cpSync(source, root, { recursive: true });
    mkdirSync(join(root, ".git", "objects"), { recursive: true });
    writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(root, ".git", "objects", "metadata"), "git metadata\n");
    assert.doesNotThrow(() => validateScopeFixture(fixture, root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
