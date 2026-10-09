import { createHash } from "node:crypto";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

export type ScopeFixture = {
  version: number;
  source_hashes: Record<string, string>;
  questions: {
    id: string;
    language: string;
    query: string;
    required: { file: string; line: number; text: string }[];
    answer: string;
    forbidden_claims: string[];
  }[];
};

const FILES = ["php/scopes.php", "python/scopes.py"];

function checkedSource(root: string, file: string): string {
  if (!FILES.includes(file)) throw new Error(`Unsafe or unknown source path: ${file}`);
  const absoluteRoot = realpathSync(root);
  const absoluteFile = realpathSync(resolve(root, file));
  const rel = relative(absoluteRoot, absoluteFile);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`))
    throw new Error(`Source path escapes fixture root: ${file}`);
  return absoluteFile;
}

export function validateScopeFixture(fixture: ScopeFixture, sourceRoot: string): void {
  if (fixture.version !== 1) throw new Error("Fixture version must be 1");
  if (fixture.questions.length !== 4) throw new Error("Fixture must contain exactly 4 questions");
  const actualFiles = readdirSync(sourceRoot, { withFileTypes: true, recursive: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry) => relative(sourceRoot, resolve(entry.parentPath, entry.name)).split(sep).join("/"))
    .filter((file) => !file.startsWith(".git/"))
    .sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(FILES) ||
      JSON.stringify(Object.keys(fixture.source_hashes).sort()) !== JSON.stringify(FILES))
    throw new Error("Source file set must be exactly the two scope files");
  const sources = new Map<string, string[]>();
  for (const file of FILES) {
    const source = readFileSync(checkedSource(sourceRoot, file));
    if (createHash("sha256").update(source).digest("hex") !== fixture.source_hashes[file])
      throw new Error(`Frozen source changed: ${file}`);
    const lines = source.toString("utf8").trimEnd().split("\n");
    if (lines.length >= 30) throw new Error(`Source must have fewer than 30 lines: ${file}`);
    sources.set(file, lines);
  }
  const ids = new Set<string>();
  const counts = { php: 0, python: 0 };
  for (const question of fixture.questions) {
    if (!question.id || ids.has(question.id)) throw new Error("Missing or duplicate question ID");
    ids.add(question.id);
    if (question.language !== "php" && question.language !== "python")
      throw new Error("Unsupported language");
    counts[question.language]++;
    if (!question.query.trim() || !question.answer.trim() ||
        !question.forbidden_claims.length || question.forbidden_claims.some((claim) => !claim.trim()) ||
        !question.required.length) throw new Error(`Incomplete question: ${question.id}`);
    const tuples = new Set<string>();
    for (const ref of question.required) {
      checkedSource(sourceRoot, ref.file);
      if (!ref.file.startsWith(`${question.language}/`))
        throw new Error(`Required source language mismatch: ${question.id}`);
      const tuple = JSON.stringify([ref.file, ref.line, ref.text]);
      if (tuples.has(tuple)) throw new Error(`Duplicate required tuple: ${question.id}`);
      tuples.add(tuple);
      if (!Number.isSafeInteger(ref.line) || ref.line < 1 || !ref.text ||
          sources.get(ref.file)?.[ref.line - 1] !== ref.text)
        throw new Error(`Required source line mismatch: ${question.id} ${ref.file}:${ref.line}`);
    }
  }
  if (counts.php !== 2 || counts.python !== 2) throw new Error("Scope questions must have 2/2 language counts");
}

if (process.argv[1]?.endsWith("scope-eval-fixture.ts")) {
  const manifest = JSON.parse(readFileSync(resolve(process.argv[2] ??
    "docs/experimental/benchmarks/runs/2026-10-09-scope-eval.json"), "utf8")) as ScopeFixture;
  validateScopeFixture(manifest, resolve(process.argv[3] ??
    "scripts/experimental/fixtures/scope-eval/source"));
  process.stdout.write("Validated 4 frozen scope questions.\n");
}
