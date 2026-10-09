import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import type { LanguageFixture } from "./language-eval-fixture.js";

const files = ["python/async.py", "python/local.py", "python/module.py", "python/parameter.py"];
const questions: Record<string, string> = {
  "PD-MODULE": "python/module.py", "PD-LOCAL": "python/local.py",
  "PD-ASYNC": "python/async.py", "PD-PARAM": "python/parameter.py",
};

export function validatePythonDictionaryFixture(fixture: LanguageFixture, sourceRoot: string): void {
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
  if (!Array.isArray(fixture.questions) || JSON.stringify(fixture.questions.map((question) => question.id).sort()) !== JSON.stringify(Object.keys(questions).sort())) fail("Expected exactly four question IDs");
  for (const question of fixture.questions) {
    if (question.language !== "python" || !question.query?.trim() || !question.answer?.trim() || !question.forbidden_claims?.length || question.forbidden_claims.some((claim) => !claim.trim())) fail("Incomplete Python question");
    if (question.required?.length !== (question.id === "PD-PARAM" ? 2 : 5)) fail("Unexpected required line count");
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
