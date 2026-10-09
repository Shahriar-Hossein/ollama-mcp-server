import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import type { LanguageFixture } from "./language-eval-fixture.js";

export type PythonDictionarySpec = {
  questions: Record<string, string>;
  requiredLines: Record<string, number>;
};

export const FROZEN_SPEC: PythonDictionarySpec = {
  questions: {
    "PD-MODULE": "python/module.py", "PD-LOCAL": "python/local.py",
    "PD-ASYNC": "python/async.py", "PD-PARAM": "python/parameter.py",
  },
  requiredLines: { "PD-MODULE": 5, "PD-LOCAL": 5, "PD-ASYNC": 5, "PD-PARAM": 2 },
};

export const FRESH_SPEC: PythonDictionarySpec = {
  questions: {
    "FR-PLAIN": "python/shadow_plain.py", "FR-DEFAULT": "python/shadow_default.py",
    "FR-TYPED": "python/shadow_typed.py", "FR-ASYNC": "python/async_local.py",
    "FR-MODULE": "python/module_two.py",
  },
  requiredLines: { "FR-PLAIN": 2, "FR-DEFAULT": 2, "FR-TYPED": 2, "FR-ASYNC": 5, "FR-MODULE": 5 },
};

export const HELDOUT_SPEC: PythonDictionarySpec = {
  questions: {
    "HO-KWONLY": "python/kwonly.py", "HO-TYPEDDEFAULT": "python/typed_default.py",
    "HO-CLOSURE": "python/closure.py", "HO-GLOBAL": "python/global_read.py",
    "HO-CLASS": "python/class_scope.py",
  },
  requiredLines: { "HO-KWONLY": 2, "HO-TYPEDDEFAULT": 2, "HO-CLOSURE": 6, "HO-GLOBAL": 5, "HO-CLASS": 5 },
};

export const HELDOUT2_SPEC: PythonDictionarySpec = {
  questions: {
    "H2-POSONLY": "python/posonly.py", "H2-VARKW": "python/varkw.py",
    "H2-LOCALASSIGN": "python/local_assign.py", "H2-NONLOCAL": "python/nonlocal_read.py",
    "H2-TWODICTS": "python/two_dicts.py",
  },
  requiredLines: { "H2-POSONLY": 2, "H2-VARKW": 2, "H2-LOCALASSIGN": 5, "H2-NONLOCAL": 6, "H2-TWODICTS": 5 },
};

export function validatePythonDictionaryFixture(
  fixture: LanguageFixture,
  sourceRoot: string,
  spec: PythonDictionarySpec = FROZEN_SPEC,
): void {
  const questions = spec.questions;
  const files = Object.values(questions).sort();
  const fail = (message: string): never => { throw new Error(message); };
  const root = resolve(sourceRoot);
  if (lstatSync(root).isSymbolicLink()) fail("Symlink source root");
  const entries = readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => {
    const path = relative(root, resolve(entry.parentPath, entry.name));
    return path !== ".git" && !path.startsWith(`.git${sep}`);
  });
  if (entries.some((entry) => entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile()))) fail("Unsupported source entry");
  if (entries.some((entry) => entry.isDirectory() && relative(root, resolve(entry.parentPath, entry.name)) !== "python")) fail("Unexpected source directory");
  const actual = entries.filter((entry) => entry.isFile()).map((entry) =>
    relative(root, resolve(entry.parentPath, entry.name)).split(sep).join("/")).sort();
  if (fixture.version !== 1) fail("Fixture version must be 1");
  if (JSON.stringify(actual) !== JSON.stringify(files) || JSON.stringify(Object.keys(fixture.source_hashes ?? {}).sort()) !== JSON.stringify(files)) fail("Unexpected source file set");
  const sources = new Map<string, string[]>();
  for (const file of files) {
    const data = readFileSync(resolve(root, file));
    if (createHash("sha256").update(data).digest("hex") !== fixture.source_hashes[file]) fail(`Frozen source changed: ${file}`);
    sources.set(file, data.toString("utf8").split("\n"));
  }
  if (!Array.isArray(fixture.questions) || JSON.stringify(fixture.questions.map((question) => question.id).sort()) !== JSON.stringify(Object.keys(questions).sort())) fail("Unexpected question IDs");
  for (const question of fixture.questions) {
    if (question.language !== "python" || !question.query?.trim() || !question.answer?.trim() || !question.forbidden_claims?.length || question.forbidden_claims.some((claim) => !claim.trim())) fail("Incomplete Python question");
    if (question.required?.length !== spec.requiredLines[question.id]) fail("Unexpected required line count");
    const seen = new Set<number>();
    for (const ref of question.required) {
      if (!ref.file || ref.file.includes("\\") || ref.file.split("/").some((part) => !part || part === "." || part === "..") || ref.file.startsWith("/")) fail("Unsafe source reference");
      if (ref.file !== questions[question.id] || !Number.isSafeInteger(ref.line) || ref.line < 1 || !ref.text || sources.get(ref.file)?.[ref.line - 1] !== ref.text) fail("Required source line mismatch");
      if (seen.has(ref.line)) fail("Duplicate required line");
      seen.add(ref.line);
    }
  }
}

if (process.argv[1]?.endsWith("python-dictionary-eval-fixture.ts")) {
  const manifest = resolve(process.argv[2] ?? "docs/experimental/benchmarks/runs/2026-10-09-python-dictionary-eval.json");
  validatePythonDictionaryFixture(JSON.parse(readFileSync(manifest, "utf8")), resolve(process.argv[3] ?? "scripts/experimental/fixtures/python-dictionary-eval/source"));
  process.stdout.write("Validated four frozen Python dictionary questions.\n");
}
