import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import type { LanguageFixture } from "./language-eval-fixture.js";
import { validatePythonDictionaryFixture } from "./python-dictionary-eval-fixture.js";

const source = resolve("scripts/experimental/fixtures/python-dictionary-eval/source");
const load = (): LanguageFixture => JSON.parse(readFileSync("docs/experimental/benchmarks/runs/2026-10-09-python-dictionary-eval.json", "utf8"));
function temporary(run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "python-dictionary-fixture-"));
  try { cpSync(source, root, { recursive: true }); run(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test("four frozen Python dictionary questions validate independently of planner", () => {
  const fixture = load();
  validatePythonDictionaryFixture(fixture, source);
  assert.deepEqual(fixture.questions.map((question) => question.required.map((ref) => ref.line)), [
    [1, 2, 3, 13, 14], [6, 7, 8, 9, 11], [1, 2, 3, 13, 14], [6, 7],
  ]);
});

test("fixture rejects wrong IDs, language, unsafe or incorrect references and incomplete keys", () => {
  const mutations = [
    (f: LanguageFixture) => { f.version = 2; },
    (f: LanguageFixture) => { f.questions.pop(); },
    (f: LanguageFixture) => { f.questions[0].id = f.questions[1].id; },
    (f: LanguageFixture) => { f.questions[0].language = "javascript"; },
    (f: LanguageFixture) => { f.questions[0].required[0].file = "../module.py"; },
    (f: LanguageFixture) => { f.questions[0].required[0].file = "/tmp/module.py"; },
    (f: LanguageFixture) => { f.questions[0].required[0].file = "python\\module.py"; },
    (f: LanguageFixture) => { f.questions[0].required[0].text = "wrong"; },
    (f: LanguageFixture) => { f.questions[0].required[0].line = 0; },
    (f: LanguageFixture) => { f.questions[0].required[0] = f.questions[0].required[1]; },
    (f: LanguageFixture) => { f.questions[0].answer = ""; },
    (f: LanguageFixture) => { f.questions[0].forbidden_claims = []; },
    (f: LanguageFixture) => { delete f.source_hashes["python/module.py"]; },
  ];
  for (const mutate of mutations) { const fixture = load(); mutate(fixture); assert.throws(() => validatePythonDictionaryFixture(fixture, source)); }
});

test("source pins reject changed and extra files while only root Git metadata is ignored", () => {
  temporary((root) => {
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, ".git/metadata"), "ignored");
    validatePythonDictionaryFixture(load(), root);
    mkdirSync(join(root, "python/.git"));
    writeFileSync(join(root, "python/.git/answer.json"), "{}");
    assert.throws(() => validatePythonDictionaryFixture(load(), root), /Unexpected source/);
    rmSync(join(root, "python/.git"), { recursive: true });
    writeFileSync(join(root, "extra.py"), "pass\n");
    assert.throws(() => validatePythonDictionaryFixture(load(), root), /Unexpected source/);
    rmSync(join(root, "extra.py"));
    writeFileSync(join(root, "python/module.py"), "pass\n");
    assert.throws(() => validatePythonDictionaryFixture(load(), root), /Frozen source changed/);
  });
});

test("source file, directory and root symlinks cannot escape the frozen fixture", () => {
  temporary((root) => {
    rmSync(join(root, "python/module.py"));
    symlinkSync(join(source, "python/module.py"), join(root, "python/module.py"));
    assert.throws(() => validatePythonDictionaryFixture(load(), root), /Unsupported source entry/);
    rmSync(join(root, "python"), { recursive: true });
    symlinkSync(join(source, "python"), join(root, "python"));
    assert.throws(() => validatePythonDictionaryFixture(load(), root), /Unsupported source entry/);
    const alias = join(root, "alias");
    symlinkSync(source, alias);
    assert.throws(() => validatePythonDictionaryFixture(load(), alias), /Symlink source root/);
  });
});

test("fresh Python dictionary fixture validates against its frozen sources", async () => {
  const { PYTHON_DICTIONARY_FRESH_FIXTURE: fresh } = await import("./run-python-dictionary-fresh-eval.js");
  const manifest = JSON.parse(readFileSync(fresh.manifestPath, "utf8"));
  fresh.validate(manifest, fresh.sourcePath);
});
