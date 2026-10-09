import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

type RequiredLine = { file: string; line: number; text: string };
type Question = {
  id: string;
  language: string;
  query: string;
  required: RequiredLine[];
  answer: string;
  forbidden_claims: string[];
};
export type LanguageFixture = {
  version: number;
  source_hashes: Record<string, string>;
  questions: Question[];
};

const EXPECTED_COUNTS = { php: 4, python: 4, go: 2, rust: 2 };

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, resolve(entry.parentPath, entry.name)).split(sep).join("/"))
    .filter((file) => !file.startsWith(".git/"))
    .sort();
}

function checkedSource(root: string, file: string): string {
  if (!file || file.includes("\\") || resolve(file) === file)
    throw new Error(`Unsafe source path: ${file}`);
  const absoluteRoot = resolve(root);
  const absoluteFile = resolve(absoluteRoot, file);
  const rel = relative(absoluteRoot, absoluteFile);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`))
    throw new Error(`Source path escapes fixture root: ${file}`);
  return absoluteFile;
}

export function validateLanguageFixture(
  fixture: LanguageFixture,
  sourceRoot: string,
): void {
  if (fixture.version !== 1) throw new Error("Fixture version must be 1");
  if (!fixture.questions || fixture.questions.length !== 12)
    throw new Error("Fixture must contain exactly 12 questions");

  const actualFiles = sourceFiles(resolve(sourceRoot));
  const frozenFiles = Object.keys(fixture.source_hashes ?? {}).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(frozenFiles))
    throw new Error("Source hash map must cover exactly the source-only fixture files");
  for (const [file, expectedHash] of Object.entries(fixture.source_hashes)) {
    const source = readFileSync(checkedSource(sourceRoot, file));
    const actualHash = createHash("sha256").update(source).digest("hex");
    if (actualHash !== expectedHash) throw new Error(`Frozen source changed: ${file}`);
  }

  const ids = new Set<string>();
  const counts = { php: 0, python: 0, go: 0, rust: 0 };
  for (const question of fixture.questions) {
    if (!question.id || ids.has(question.id))
      throw new Error(`Missing or duplicate question ID: ${question.id}`);
    ids.add(question.id);
    if (!Object.hasOwn(counts, question.language))
      throw new Error(`Unsupported language: ${question.language}`);
    counts[question.language as keyof typeof counts]++;
    if (!question.query.trim() || !question.answer.trim() || !question.forbidden_claims.length)
      throw new Error(`Incomplete question record: ${question.id}`);
    if (!question.required.length) throw new Error(`No required lines for ${question.id}`);
    for (const required of question.required) {
      if (!Number.isSafeInteger(required.line) || required.line < 1 || !required.text)
        throw new Error(`Invalid required line in ${question.id}`);
      const source = readFileSync(checkedSource(sourceRoot, required.file), "utf8");
      if (source.split("\n")[required.line - 1] !== required.text)
        throw new Error(`Required source line mismatch: ${question.id} ${required.file}:${required.line}`);
    }
  }
  for (const [language, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (counts[language as keyof typeof counts] !== expected)
      throw new Error(`${language} question count must be ${expected}`);
  }

}

if (process.argv[1]?.endsWith("language-eval-fixture.ts")) {
  const manifestPath = resolve(
    process.argv[2] ?? "docs/experimental/benchmarks/runs/2026-10-09-language-eval.json",
  );
  const sourceRoot = resolve(
    process.argv[3] ?? "scripts/experimental/fixtures/language-eval/source",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as LanguageFixture;
  validateLanguageFixture(manifest, sourceRoot);
  process.stdout.write(`Validated ${manifest.questions.length} frozen language questions.\n`);
}
