import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveModelBudget, type generate } from "../../ollama-client.js";
import { compileEvidenceBundles, decomposeQuestion, directEvidenceForPart, runLocalExploreRepo as runScout, validateModelAnswer, type Candidate } from "./local-explore-repo.js";

const runLocalExploreRepo: typeof runScout = (params, generateAnswer) => runScout(params, generateAnswer,
  (model, overrides) => resolveModelBudget(model, overrides, async () => ({ parameters: model.includes(":i-") ? "num_ctx 32768\nnum_predict 25000" : "num_ctx 50000\nnum_predict 25000" })));

type PromptSource = { file: string; lines: Array<{ ref: string; line: number; text: string }> };
type PromptBundle = { why_retrieved: string; sources: PromptSource[] };
const promptBundles = (prompt: string) => JSON.parse(prompt.split("Evidence bundles: ")[1].split("\nReturn JSON")[0]) as PromptBundle[];

test("rejects model evidence that does not quote the supplied line", () => {
  const candidates: Candidate[] = [{ id: "C1", kind: "symbol", file: "src/pricing.ts", lines: [{ line: 3, text: "export function calculateTotal() {" }] }];
  const checked = validateModelAnswer(JSON.stringify({
    selected_ids: ["C1", "C99"],
    evidence: [
      { id: "C1", line: 3, quote: "calculateTotal" },
      { id: "C1", line: 3, quote: "wrongFunction" },
      { id: "C99", line: 3, quote: "calculateTotal" },
    ],
    confidence: "high",
    unresolved: [],
  }), candidates);
  assert.deepEqual(checked.selected_ids, ["C1"]);
  assert.equal(checked.evidence.length, 1);
  assert.equal(checked.rejected_evidence, 2);
});

test("copies the exact source quote when the model supplies only a checked line", () => {
  const candidates: Candidate[] = [{ id: "C1", kind: "symbol", file: "src/pricing.ts", lines: [{ line: 3, text: "export function calculateTotal() {" }] }];
  const checked = validateModelAnswer(JSON.stringify({ evidence: [{ id: "C1", line: 3 }], part_evidence: [{ part_id: "P1", evidence_ids: ["C1"] }] }), candidates, [{ id: "P1", question: "Where?", evidence_needed: "Direct source." }]);
  assert.deepEqual(checked.evidence, [{ id: "C1", file: "src/pricing.ts", line: 3, quote: "export function calculateTotal() {" }]);
  assert.equal(checked.coverage[0].status, "supported");
});

test("retrieves before calling the model, then retries a bad evidence ref once", async () => {
  const root = mkdtempSync(join(tmpdir(), "local-explore-repo-"));
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/pricing.ts"), "export function calculateTotal(quantity: number) {\n  return quantity * 5;\n}\n");
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "add", "src/pricing.ts"]);
    execFileSync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"]);
    const before = readFileSync(join(root, "src/pricing.ts"), "utf8");
    let calls = 0;
    const stub: typeof generate = async (model, prompt, _system, format, think, options) => {
      calls++;
      assert.equal(model, "qwen-context:h-q4_0-64k");
      assert.equal(typeof format, "object");
      assert.equal(think, false);
      assert.deepEqual(options, { num_ctx: 50_000, num_predict: 25_000 });
      const sources = promptBundles(prompt).flatMap((bundle) => bundle.sources);
      const source = sources.find((item) => item.lines.some((line) => line.text.includes("calculateTotal")));
      assert.ok(source);
      const line = source.lines.find((item) => item.text.includes("calculateTotal"))!;
      return JSON.stringify({ part_evidence: [{ part_id: "P1", evidence_refs: [calls === 1 ? "E999" : line.ref] }], confidence: "medium", unresolved: [], next_action: { ref: "" } });
    };
    const result = await runLocalExploreRepo({ repository_root: root, query: "Where is calculateTotal defined?" }, stub);
    assert.equal(result.status, "evidence_selected");
    assert.equal(result.model_calls, 2);
    assert.equal(result.evidence[0].file, "src/pricing.ts");
    assert.equal(readFileSync(join(root, "src/pricing.ts"), "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("decomposes independent evidence requirements", () => {
  assert.deepEqual(decomposeQuestion("Where is x registered, and is it enabled by default?"), [
    { id: "P1", question: "Where is x registered", evidence_needed: "The call that registers the named tool and its guard; an import or function definition alone is insufficient." },
    { id: "P2", question: "is it enabled by default", evidence_needed: "The named flag mapping, the helper resolving that mapping, and the expression establishing the master flag default." },
  ]);
});

test("lock question includes the SQLite lock and its caller in source bundles", async () => {
  const root = process.cwd();
  const stub: typeof generate = async (_model, prompt) => {
    const sources = promptBundles(prompt).flatMap((bundle) => bundle.sources);
    const lock = sources.find((source) => source.file === "src/quality-review/storage.ts" && source.lines.some((line) => line.text.includes("Another scan/worker owns the queue")));
    const caller = sources.find((source) => source.file === "src/quality-review/service.ts" && source.lines.some((line) => line.text.includes("this.store.lock()")));
    assert.ok(lock, "Store.lock must reach the context");
    assert.ok(caller, "its service caller must reach the context");
    const required = ["this.transaction(", "BEGIN IMMEDIATE", "INSERT INTO worker_lock", "Another scan/worker owns the queue"];
    const refs = required.map((text) => {
      const line = sources.filter((source) => source.file === "src/quality-review/storage.ts").flatMap((source) => source.lines).find((line) => line.text.includes(text));
      assert.ok(line, `${text} must reach context`);
      return line.ref;
    });
    const callerRef = caller.lines.find((line) => line.text.includes("this.store.lock()"))!.ref;
    return JSON.stringify({ part_evidence: [{ part_id: "P1", evidence_refs: [...refs, callerRef] }], confidence: "medium", unresolved: [], next_action: { ref: "" } });
  };
  const result = await runLocalExploreRepo({ repository_root: root, query: "How does Quality Review prevent duplicate concurrent workers?" }, stub);
  assert.equal(result.status, "evidence_selected");
});

test("expands one requested source window for a missing question part", async () => {
  const root = mkdtempSync(join(tmpdir(), "local-explore-expand-"));
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/work.ts"), "export function work() {\n  const ready = true;\n  return ready;\n}\n");
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "add", "src/work.ts"]);
    execFileSync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"]);
    let calls = 0;
    const stub: typeof generate = async (_model, prompt) => {
      calls++;
      const bundles = promptBundles(prompt);
      const sources = bundles.flatMap((bundle) => bundle.sources);
      const source = sources.find((item) => item.lines.some((line) => line.text.includes("function work")))!;
      const ref = source.lines.find((line) => line.text.includes("function work"))!.ref;
      if (calls === 1) return JSON.stringify({ part_evidence: [{ part_id: "P1", evidence_refs: [] }], confidence: "low", unresolved: ["Need a wider view"], next_action: { ref } });
      assert.ok(bundles.some((bundle) => bundle.why_retrieved === "bounded follow-up read"));
      return JSON.stringify({ part_evidence: [{ part_id: "P1", evidence_refs: [ref] }], confidence: "medium", unresolved: [], next_action: { ref: "" } });
    };
    const result = await runLocalExploreRepo({ repository_root: root, query: "Where is work defined?" }, stub);
    assert.equal(result.status, "evidence_selected");
    assert.equal(result.model_calls, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("autonomous gate coverage excludes the experimental master flag", () => {
  const query = "Which environment variables gate the autonomous tools?";
  const part = decomposeQuestion(query)[0];
  const cite = (quote: string) => ({ id: "C1", file: "src/config/features.ts", line: 1, quote });
  assert.equal(directEvidenceForPart(part, [cite('"ENABLE_EXPERIMENTAL"'), cite('"CLOUD_CLAUDE_ENABLED"')], query), false);
  assert.equal(directEvidenceForPart(part, [cite('"LOCAL_WORKER_ENABLED"'), cite('"CLOUD_CLAUDE_ENABLED"')], query), true);
});

test("packs both autonomous guarded registrations and the default helper", async () => {
  const queries = [
    "Which environment variables gate the autonomous tools, and which tool does each gate?",
    "Where is local_explorer_task registered, and is it enabled by default?",
  ];
  for (const query of queries) {
    let calls = 0;
    const stub: typeof generate = async (_model, prompt) => {
      calls++;
      const lines = promptBundles(prompt).flatMap((bundle) => bundle.sources).flatMap((source) => source.lines);
      const required = query.includes("autonomous")
        ? ["LOCAL_WORKER_ENABLED", "CLOUD_CLAUDE_ENABLED", "if (features.localWorker)", "registerRunLocalWorkerTask(server)", "if (features.cloudClaudeWorker)", "registerRunCloudClaudeTask(server)"]
        : ["const experimentalFeature", "?? experimental", "localExplorerTask: experimentalFeature", "?? false"];
      for (const text of required) assert.ok(lines.some((line) => line.text.includes(text)), `${text} must reach context`);
      return JSON.stringify({ part_evidence: [], unresolved: [], next_action: { ref: "" } });
    };
    const result = await runLocalExploreRepo({ repository_root: process.cwd(), query }, stub);
    assert.ok(calls > 0, "packing assertions must execute");
    assert.equal(result.model_calls, calls);
    assert.equal(result.status, "needs_review");
  }
});

test("reports overflow without calling the model or reducing its saved output ceiling", async () => {
  let calls = 0;
  const result = await runLocalExploreRepo({ repository_root: process.cwd(), query: "Where is embed keep_alive set?", model: "qwen-context:i-q8_0-32k", num_ctx: 26030 }, async () => { calls++; return "{}"; });
  assert.equal(result.status, "input_overflow");
  assert.equal(result.model_calls, 0);
  assert.equal(calls, 0);
  assert.equal(result.input_checks[0].num_predict, 25000);
});

test("requires transaction serialization in addition to a lock rejection and caller", () => {
  const part = decomposeQuestion("How does Quality Review prevent duplicate concurrent workers?")[0];
  const evidence = ["throw new Error('locked')", "this.store.lock()"].map((quote) => ({ id: "C1", file: "storage.ts", line: 1, quote }));
  assert.equal(directEvidenceForPart(part, evidence, part.question), false);
});

test("deduplicated source is charged once and packing overflow is explicit", () => {
  const parts = decomposeQuestion("Where is x registered, and is it enabled by default?");
  const candidate: Candidate = { id: "C1", kind: "symbol", file: "source.ts", lines: Array.from({ length: 10 }, (_, index) => ({ line: index + 1, text: "x".repeat(1500) })) };
  const compiled = compileEvidenceBundles(parts, new Map(parts.map((part) => [part.id, [candidate]])));
  assert.equal(compiled.overflow, false);
  assert.equal(compiled.bundles.length, 2);
  assert.equal(compiled.candidates.length, 1);
  const oversized = { ...candidate, lines: candidate.lines.map((line) => ({ ...line, text: "x".repeat(2500) })) };
  assert.equal(compileEvidenceBundles(parts, new Map([[parts[0].id, [oversized]]])).overflow, true);
});

test("keeps a supported environment mapping when a retry resolves registrations", async () => {
  let calls = 0;
  const stub: typeof generate = async (_model, prompt) => {
    calls++;
    const sources = promptBundles(prompt).flatMap((bundle) => bundle.sources);
    const ref = (text: string) => {
      const line = sources.flatMap((source) => source.lines).find((line) => line.text.includes(text));
      assert.ok(line, `${text} must reach context`);
      return line.ref;
    };
    const mapping = [ref('localWorker: autonomousFlag'), ref('cloudClaudeWorker: autonomousFlag')];
    const registrations = ['if (features.localWorker)', 'registerRunLocalWorkerTask(server)', 'if (features.cloudClaudeWorker)', 'registerRunCloudClaudeTask(server)'].map(ref);
    return JSON.stringify({ part_evidence: [{ part_id: "P1", evidence_refs: calls === 1 ? mapping : [] }, { part_id: "P2", evidence_refs: calls === 1 ? [] : registrations }], next_action: { ref: "" } });
  };
  const result = await runLocalExploreRepo({ repository_root: process.cwd(), query: "Which environment variables gate the autonomous tools, and which tool does each gate?" }, stub);
  assert.equal(result.status, "evidence_selected");
  assert.equal(result.evidence.length, 6);
  assert.equal(result.model_calls, 2);
});
