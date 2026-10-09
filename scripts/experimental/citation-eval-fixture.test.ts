import assert from "node:assert/strict";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { validateCitationFixture, type CitationFixture } from "./citation-eval-fixture.js";
const root = resolve("scripts/experimental/fixtures/citation-eval/source");
const load = (): CitationFixture => JSON.parse(readFileSync("docs/experimental/benchmarks/runs/2026-10-09-citation-eval.json", "utf8"));
test("frozen citation cases and separate questions validate", () => validateCitationFixture(load(), root));
test("rejects changed citations, unsafe paths, duplicate refs and non-header targets", () => {
  const mutations = [
    (f: CitationFixture) => { f.cases[0].citations[0].text = "wrong"; },
    (f: CitationFixture) => { f.cases[0].citations[0].file = "../scopes.py"; },
    (f: CitationFixture) => { f.cases[0].citations.push(f.cases[0].citations[0]); },
    (f: CitationFixture) => { f.cases[0].target = f.cases[0].citations[0]; },
    (f: CitationFixture) => { f.cases[0].expected_foreign = []; },
  ];
  for (const mutate of mutations) { const f = load(); mutate(f); assert.throws(() => validateCitationFixture(f, root)); }
});
test("rejects incorrect case and question counts and duplicate IDs", () => {
  for (const collection of ["cases", "questions"] as const) {
    const f = load(); f[collection].pop(); assert.throws(() => validateCitationFixture(f, root));
    const duplicate = load(); duplicate[collection][0].id = duplicate[collection][1].id;
    assert.throws(() => validateCitationFixture(duplicate, root));
  }
});
test("source changes and extra files fail; git metadata is excluded", () => {
  const temp = mkdtempSync(resolve(tmpdir(), "citation-fixture-"));
  try {
    cpSync(root, temp, { recursive: true });
    writeFileSync(resolve(temp, "extra.py"), "pass\n");
    assert.throws(() => validateCitationFixture(load(), temp));
    rmSync(resolve(temp, "extra.py"));
    cpSync(root, resolve(temp, ".git"), { recursive: true });
    validateCitationFixture(load(), temp);
    writeFileSync(resolve(temp, "python/scopes.py"), "pass\n");
    assert.throws(() => validateCitationFixture(load(), temp));
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("nested .git files remain extra source files", () => {
  const temp = mkdtempSync(resolve(tmpdir(), "citation-nested-git-"));
  try {
    cpSync(root, temp, { recursive: true });
    mkdirSync(resolve(temp, "foo/.git"), { recursive: true });
    writeFileSync(resolve(temp, "foo/.git/answer.json"), "{}\n");
    assert.throws(() => validateCitationFixture(load(), temp), /Unexpected source file set/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
