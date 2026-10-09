import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { checkedFile } from "../../src/experimental/tools/local-explore-packing.js";
import { validateCitationFixture, type CitationFixture } from "./citation-eval-fixture.js";
import { emptyManualReview, validateEvidenceAnswer } from "./language-eval-score.js";
import { pythonCitationOwners, reviewPythonCitations } from "./python-citation-owners.js";
import type { EvidenceLine } from "./scope-answer-context.js";
import { parseLanguageEvalArgs, runLanguageEval, type EvalFixtureDescriptor } from "./run-language-eval.js";

export const CITATION_FIXTURE: EvalFixtureDescriptor = {
  manifestPath: resolve("docs/experimental/benchmarks/runs/2026-10-09-citation-eval.json"),
  sourcePath: resolve("scripts/experimental/fixtures/citation-eval/source"),
  sha256: "a4a7ed44671efe3b9d90adf0475079f29b51162de10d591ff93c7829d60d1dc7",
  validate: (fixture, root) => validateCitationFixture(fixture as CitationFixture, root),
  implementationFiles: [
    "scripts/experimental/run-citation-eval.ts",
    "scripts/experimental/citation-eval-fixture.ts",
    "scripts/experimental/citation-owner-check.ts",
    "scripts/experimental/python-citation-owners.ts",
    "scripts/experimental/fixtures/citation-eval/source/python/scopes.py",
  ],
};
const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const evidence = (r: { file: string; line: number; text: string }): EvidenceLine => ({ file: r.file, line: r.line, quote: r.text });
const loc = (r: { file: string; line: number }) => ({ file: r.file, line: r.line });
function canonical(path: string): string {
  let parent = resolve(path);
  const tail: string[] = [];
  while (!existsSync(parent)) {
    if (lstatSync(parent, { throwIfNoEntry: false })?.isSymbolicLink())
      throw new Error("Citation output contains a dangling symlink");
    tail.unshift(relative(dirname(parent), parent));
    parent = dirname(parent);
  }
  return join(realpathSync(parent), ...tail);
}
export function checkCitationOutput(output: string, descriptor = CITATION_FIXTURE): void {
  const protectedPaths = [descriptor.manifestPath, descriptor.sourcePath].map(canonical);
  for (const path of [output, `${output}.tmp`, `${output}.owners.json`, `${output}.owners.json.tmp`].map(canonical)) {
    if (protectedPaths.some(p => path === p || path.startsWith(`${p}${sep}`)))
      throw new Error("Citation output would overwrite the frozen fixture");
  }
}
function checkedFixture(descriptor: EvalFixtureDescriptor): CitationFixture {
  if (hash(descriptor.manifestPath) !== descriptor.sha256) throw new Error("Citation manifest differs from frozen pin");
  const fixture = JSON.parse(readFileSync(descriptor.manifestPath, "utf8")) as CitationFixture;
  validateCitationFixture(fixture, descriptor.sourcePath);
  return fixture;
}
export function parseCitationEvalArgs(args: string[]) {
  const options = parseLanguageEvalArgs(args);
  if (!args.includes("--output")) options.output = resolve("benchmark-data/language-eval/citation-development/model-run.json");
  return options;
}
type RawCell = {
  id: string;
  result?: { evidence?: EvidenceLine[] };
  answer_call?: { output?: string | null } | null;
  manual_review?: ReturnType<typeof emptyManualReview>;
};

export function writeCitationOwnershipSidecar(output: string, descriptor = CITATION_FIXTURE) {
  checkCitationOutput(output, descriptor);
  const fixture = checkedFixture(descriptor);
  const rawBytes = readFileSync(output);
  const raw = JSON.parse(rawBytes.toString("utf8")) as {
    complete: boolean; protocol: { fixture_sha256: string; source_hashes: Record<string, string>; implementation_sha256: Record<string, string> }; results: RawCell[];
  };
  if (!raw.complete || raw.protocol.fixture_sha256 !== descriptor.sha256 ||
      JSON.stringify(raw.protocol.source_hashes) !== JSON.stringify(fixture.source_hashes))
    throw new Error("Raw evaluation fixture pins are invalid");
  for (const file of descriptor.implementationFiles) {
    if (!raw.protocol.implementation_sha256[file]) throw new Error(`Missing implementation pin: ${file}`);
  }
  for (const [file, expected] of Object.entries(raw.protocol.implementation_sha256)) {
    if (hash(resolve(file)) !== expected) throw new Error(`Evaluation implementation changed: ${file}`);
  }
  const staticCases = fixture.cases.map(c => {
    const review = reviewPythonCitations(descriptor.sourcePath, evidence(c.target), c.citations.map(evidence));
    if (JSON.stringify(review.foreign_owner_citations) !== JSON.stringify(c.expected_foreign.map(loc)) ||
        JSON.stringify(review.unresolved_citations) !== JSON.stringify(c.expected_unresolved.map(loc)))
      throw new Error(`Frozen owner rubric mismatch: ${c.id}`);
    return { id: c.id, claim: c.claim, claim_truth: c.claim_truth, review, manual_review: emptyManualReview() };
  });
  const cells = raw.results.map(cell => {
    const question = fixture.questions.find(q => q.id === cell.id);
    if (!question) throw new Error(`Unknown raw question ID: ${cell.id}`);
    if (cell.manual_review?.status !== "pending") throw new Error("Raw manual review must remain pending");
    const target = evidence(question.target);
    const noCitations = reviewPythonCitations(descriptor.sourcePath, target, []);
    const selected = cell.result?.evidence ?? [];
    let claims: Array<{ text?: string; status: "checked" | "not_checked"; review?: ReturnType<typeof reviewPythonCitations>; error?: string }> = [];
    let error: string | null = null;
    try {
      if (selected.some(ref => !Object.hasOwn(fixture.source_hashes, ref.file)))
        throw new Error("Selected evidence is outside frozen source files");
      pythonCitationOwners(descriptor.sourcePath, selected);
      if (!cell.answer_call?.output) throw new Error("No structured answer available");
      const checked = validateEvidenceAnswer(cell.answer_call.output, selected);
      if (!checked.answer.trim()) throw new Error("No answer text available");
      const parsed = JSON.parse(cell.answer_call.output) as { answer: string; claims: unknown[]; uncertainty: string[] };
      claims = checked.claims.map((claim, index) => {
        const individual = validateEvidenceAnswer(JSON.stringify({ ...parsed, claims: [parsed.claims[index]] }), selected);
        if (individual.invalid_citations.length)
          return { text: claim.text, status: "not_checked", error: "Invalid or unselected citation" };
        const refs = claim.citations.map(c => {
          const ref = selected.find(s => s.file === c.file && s.line === c.line)!;
          return { file: ref.file, line: ref.line,
            quote: readFileSync(checkedFile(descriptor.sourcePath, ref.file), "utf8").split("\n")[ref.line - 1] };
        });
        return { text: claim.text, status: "checked", review: reviewPythonCitations(descriptor.sourcePath, target, refs) };
      });
      if (!claims.length) error = "No structured claims available";
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      claims = [];
    }
    return { id: cell.id, status: "needs_review", ownership_status: error || claims.some(c => c.status === "not_checked") ? "not_checked" : "checked",
      error, claims, no_citation_review: noCitations, manual_review: emptyManualReview() };
  });
  checkedFixture(descriptor);
  if (hash(output) !== createHash("sha256").update(rawBytes).digest("hex")) throw new Error("Raw artifact changed during owner review");
  const sidecar = {
    status: "needs_review", raw_artifact_sha256: hash(output), fixture_sha256: descriptor.sha256,
    source_hashes: fixture.source_hashes, implementation_sha256: raw.protocol.implementation_sha256,
    static_cases: staticCases, model_questions: cells, manual_review: emptyManualReview(),
  };
  writeFileSync(`${output}.owners.json`, `${JSON.stringify(sidecar, null, 2)}\n`);
  return sidecar;
}
export async function runCitationEval(
  options: Omit<Parameters<typeof runLanguageEval>[0], "fixture" | "answerContextMode">,
  descriptor = CITATION_FIXTURE,
) {
  checkCitationOutput(options.output, descriptor);
  checkedFixture(descriptor);
  const result = await runLanguageEval({ ...options, fixture: descriptor, answerContextMode: "selected_only" });
  const ownership = writeCitationOwnershipSidecar(options.output, descriptor);
  return { ...result, ownership };
}
if (process.argv[1]?.endsWith("run-citation-eval.ts")) {
  const options = parseCitationEvalArgs(process.argv.slice(2));
  runCitationEval(options)
    .then(({ results }) => process.stdout.write(`Completed ${results.length} question(s): ${options.output}\n`))
    .catch(error => { process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`); process.exitCode = 1; });
}
