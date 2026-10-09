import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { resolve, relative, sep } from "node:path";

export type CitationRef = { file: string; line: number; text: string };
export type CitationFixture = {
  version: number;
  source_hashes: Record<string, string>;
  rubric: string;
  cases: { id: string; target: CitationRef; claim: string; citations: CitationRef[];
    expected_foreign: CitationRef[]; expected_unresolved: CitationRef[];
    claim_truth: "correct" | "incorrect" | "unknown" }[];
  questions: { id: string; language: "python"; target: CitationRef; query: string; required: CitationRef[];
    answer: string; forbidden_claims: string[] }[];
};
const ids = ["BAD-BINDING", "BAD-RETURN", "CLEAN-LOCAL", "CLEAN-MODULE", "CLEAN-CONTRAST", "UNKNOWN"];
const key = (r: CitationRef) => `${r.file}:${r.line}`;
export function validateCitationFixture(f: CitationFixture, root: string): void {
  const fail = (message: string): never => { throw new Error(message); };
  const safe = (file: string): string => {
    if (!file || file.includes("\\") || file.split("/").some(p => !p || p === "." || p === "..") || file.startsWith("/")) fail("Unsafe source path");
    const path = resolve(root, file);
    let current = resolve(root);
    for (const part of file.split("/")) {
      current = resolve(current, part);
      if (lstatSync(current).isSymbolicLink()) fail("Symlink source path");
    }
    return path;
  };
  const entries = readdirSync(root, { recursive: true, withFileTypes: true });
  if (entries.some(e => e.isSymbolicLink() && !relative(root, resolve(e.parentPath, e.name)).startsWith(`.git${sep}`))) fail("Symlink source path");
  const files = entries
    .filter(e => e.isFile() && !relative(root, resolve(e.parentPath, e.name)).startsWith(`.git${sep}`))
    .map(e => relative(root, resolve(e.parentPath, e.name)).split(sep).join("/")).sort();
  if (f.version !== 1 || !f.rubric?.trim()) fail("Invalid fixture metadata");
  if (JSON.stringify(files) !== JSON.stringify(Object.keys(f.source_hashes).sort()) || JSON.stringify(files) !== JSON.stringify(["python/scopes.py"])) fail("Unexpected source file set");
  const sources = new Map<string, string[]>();
  for (const [file, hash] of Object.entries(f.source_hashes)) {
    const data = readFileSync(safe(file));
    if (createHash("sha256").update(data).digest("hex") !== hash) fail("Frozen source changed");
    sources.set(file, data.toString("utf8").split("\n"));
  }
  const refs = (rs: CitationRef[]) => {
    const seen = new Set<string>();
    for (const r of rs) {
      safe(r.file);
      if (!Number.isSafeInteger(r.line) || r.line < 1 || !r.text || sources.get(r.file)?.[r.line - 1] !== r.text) fail("Citation line mismatch");
      if (seen.has(key(r))) fail("Duplicate citation");
      seen.add(key(r));
    }
  };
  const target = (r: CitationRef) => {
    refs([r]);
    if (!/^((async )?def process_(inline|background)\(\):)$/.test(r.text)) fail("Target is not a declared header");
  };
  if (JSON.stringify(f.cases.map(c => c.id).sort()) !== JSON.stringify([...ids].sort())) fail("Expected exactly six case IDs");
  for (const c of f.cases) {
    target(c.target); refs(c.citations); refs(c.expected_foreign); refs(c.expected_unresolved);
    if (!c.claim.trim() || !["correct", "incorrect", "unknown"].includes(c.claim_truth)) fail("Invalid claim");
    const foreign: CitationRef[] = [], unresolved: CitationRef[] = [];
    for (const r of c.citations) {
      // Frozen source has two top-level callables; headers belong to their own declarations.
      const owner = r.line >= 15 ? 15 : r.line >= 7 && r.line <= 12 ? 7 : undefined;
      if (owner === undefined) unresolved.push(r);
      else if (owner !== c.target.line) foreign.push(r);
    }
    if (JSON.stringify(foreign) !== JSON.stringify(c.expected_foreign) || JSON.stringify(unresolved) !== JSON.stringify(c.expected_unresolved)) fail("Owner rubric mismatch");
    if (c.id === "UNKNOWN" && (c.citations.length || c.claim_truth !== "unknown")) fail("Unknown case must abstain");
  }
  if (JSON.stringify(f.questions.map(q => q.id).sort()) !== JSON.stringify(["PY-BACKGROUND", "PY-INLINE"])) fail("Expected two question IDs");
  for (const q of f.questions) {
    if (q.language !== "python") fail("Question language must be python");
    target(q.target); refs(q.required);
    if (!q.query.trim() || !q.answer.trim() || !q.required.length || !q.forbidden_claims.length || q.forbidden_claims.some(c => !c.trim())) fail("Incomplete question");
  }
}
if (process.argv[1]?.endsWith("citation-eval-fixture.ts")) {
  const manifest = resolve(process.argv[2] ?? "docs/experimental/benchmarks/runs/2026-10-09-citation-eval.json");
  validateCitationFixture(JSON.parse(readFileSync(manifest, "utf8")), resolve(process.argv[3] ?? "scripts/experimental/fixtures/citation-eval/source"));
  process.stdout.write("Validated six citation cases and two frozen questions.\n");
}
