import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const [fixturePath, runPath, sourceRoot, outputPath] = process.argv.slice(2);
if (!outputPath)
  throw new Error(
    "Usage: tsx scripts/experimental/grade-h-heldout.ts <fixture.json> <run.json> <snapshot-root> <output.json>",
  );
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const run = JSON.parse(readFileSync(runPath, "utf8"));
if (!run.complete) throw new Error("Refusing to grade an incomplete run.");
if (run.results.length !== 1) throw new Error("Grade one model per artifact.");
for (const [file, hash] of Object.entries(fixture.files ?? {})) {
  if (createHash("sha256").update(readFileSync(resolve(sourceRoot, file))).digest("hex") !== hash) {
    throw new Error(`Frozen source changed: ${file}`);
  }
}
if (run.protocol.fixture_sha256 && run.protocol.fixture_sha256 !== createHash("sha256").update(readFileSync(fixturePath)).digest("hex")) {
  throw new Error("Frozen fixture differs from the evaluated fixture.");
}
const actualIds = run.results[0].questions.map((cell: any) => cell.id);
const expectedIds = fixture.questions.map((question: any) => question.id);
if (new Set(actualIds).size !== actualIds.length || JSON.stringify([...actualIds].sort()) !== JSON.stringify([...expectedIds].sort())) {
  throw new Error("Run must contain every frozen question exactly once.");
}
const scores = run.results[0].questions.map((cell: any) => {
  const expected = fixture.questions.find((q: any) => q.id === cell.id);
  if (!expected) throw new Error(`Unknown question ${cell.id}`);
  const result = cell.result;
  const required = expected.required as Array<{
    file: string;
    line: number;
    text: string;
  }>;
  const selected = result.evidence as Array<{
    file: string;
    line: number;
    quote: string;
  }>;
  const source = (file: string) =>
    readFileSync(resolve(sourceRoot, file), "utf8").split("\n");
  const missing = required.filter(
    (item) =>
      !selected.some(
        (e) =>
          e.file === item.file && e.line === item.line && e.quote === item.text,
      ),
  );
  const notSupplied = required.filter(
    (item) =>
      !result.candidates.some(
        (c: any) =>
          c.file === item.file &&
          c.lines.some(
            (line: any) =>
              line.line === item.line && line.text.trim() === item.text,
          ),
      ),
  );
  const exactQuotes = selected.every((e) =>
    source(e.file)[e.line - 1]?.includes(e.quote),
  );
  const abstained =
    ["no_evidence", "needs_review"].includes(result.status) &&
    result.unresolved.length > 0;
  return {
    id: cell.id,
    kind: expected.kind,
    status: result.status,
    elapsed_ms: cell.elapsed_ms,
    source_quote_integrity: exactQuotes,
    required_count: required.length,
    missing_required: missing,
    required_not_supplied: notSupplied,
    complete_evidence:
      expected.kind === "positive" && missing.length === 0 && exactQuotes,
    appropriate_abstention: expected.kind === "negative" && abstained,
    generation_completed: cell.calls.every((call: any) => call.metrics?.done === true && call.metrics?.done_reason === "stop"),
    non_required_citations: selected.filter(
      (e) =>
        !required.some((item) => item.file === e.file && item.line === e.line),
    ),
    unresolved: result.unresolved,
  };
});
writeFileSync(
  outputPath,
  JSON.stringify(
    {
      protocol:
        "v2: complete question set and source/fixture hashes checked; frozen required lines; non-required citations require manual relevance review; scout status is not an answer-quality score",
      scores,
    },
    null,
    2,
  ),
);
process.stdout.write(
  `${JSON.stringify(
    scores.map(
      ({
        id,
        complete_evidence,
        appropriate_abstention,
        required_not_supplied,
      }: any) => ({
        id,
        complete_evidence,
        appropriate_abstention,
        required_not_supplied,
      }),
    ),
    null,
    2,
  )}\n`,
);
