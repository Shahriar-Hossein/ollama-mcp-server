import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveModelBudget, type generate } from "../../ollama-client.js";
import {
  buildCandidates,
  compileEvidenceBundles,
  decomposeQuestion,
  directEvidenceForPart,
  runLocalExploreRepo as runScout,
  validateModelAnswer,
  type Candidate,
} from "./local-explore-repo.js";
import { indexRepository } from "../../explorer/indexer.js";
import { evidenceChecklist, missingEvidenceRequirements } from "./local-explore-validation.js";

const runLocalExploreRepo: typeof runScout = (params, generateAnswer) =>
  runScout(params, generateAnswer, (model, overrides, _load, reserve) =>
    resolveModelBudget(
      model,
      overrides,
      async () => ({
        parameters: model.includes(":h-q4_0-24k")
          ? "num_ctx 24576\nnum_predict 16000"
          : model.includes(":i-")
            ? "num_ctx 32768\nnum_predict 25000"
            : "num_ctx 50000\nnum_predict 16000",
      }),
      reserve,
    ),
  );

type PromptSource = { file: string; lines: Array<{ ref: string; line: number; text: string }> };
type PromptBundle = { why_retrieved: string; sources: PromptSource[] };
const promptBundles = (prompt: string) =>
  JSON.parse(prompt.split("Evidence bundles: ")[1].split("\nReturn JSON")[0]) as PromptBundle[];

test("rejects model evidence that does not quote the supplied line", () => {
  const candidates: Candidate[] = [
    {
      id: "C1",
      kind: "symbol",
      file: "src/pricing.ts",
      lines: [{ line: 3, text: "export function calculateTotal() {" }],
    },
  ];
  const checked = validateModelAnswer(
    JSON.stringify({
      selected_ids: ["C1", "C99"],
      evidence: [
        { id: "C1", line: 3, quote: "calculateTotal" },
        { id: "C1", line: 3, quote: "wrongFunction" },
        { id: "C99", line: 3, quote: "calculateTotal" },
      ],
      confidence: "high",
      unresolved: [],
    }),
    candidates,
  );
  assert.deepEqual(checked.selected_ids, ["C1"]);
  assert.equal(checked.evidence.length, 1);
  assert.equal(checked.rejected_evidence, 2);
});

test("copies the exact source quote when the model supplies only a checked line", () => {
  const candidates: Candidate[] = [
    {
      id: "C1",
      kind: "symbol",
      file: "src/pricing.ts",
      lines: [{ line: 3, text: "export function calculateTotal() {" }],
    },
  ];
  const checked = validateModelAnswer(
    JSON.stringify({
      evidence: [{ id: "C1", line: 3 }],
      part_evidence: [{ part_id: "P1", evidence_ids: ["C1"] }],
    }),
    candidates,
    [{ id: "P1", question: "Where?", evidence_needed: "Direct source." }],
  );
  assert.deepEqual(checked.evidence, [
    { id: "C1", file: "src/pricing.ts", line: 3, quote: "export function calculateTotal() {" },
  ]);
  assert.equal(checked.coverage[0].status, "supported");
});

test("retrieves before calling the model, then retries a bad evidence ref once", async () => {
  const root = mkdtempSync(join(tmpdir(), "local-explore-repo-"));
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src/pricing.ts"),
      "export function calculateTotal(quantity: number) {\n  return quantity * 5;\n}\n",
    );
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "add", "src/pricing.ts"]);
    execFileSync("git", [
      "-C",
      root,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-qm",
      "fixture",
    ]);
    const before = readFileSync(join(root, "src/pricing.ts"), "utf8");
    let calls = 0;
    const stub: typeof generate = async (model, prompt, _system, format, think, options) => {
      calls++;
      assert.equal(model, "qwen-context:h-q4_0-24k");
      assert.equal(typeof format, "object");
      assert.equal(think, false);
      assert.deepEqual(options, { num_ctx: 24_576, num_predict: 2_048 });
      const sources = promptBundles(prompt).flatMap((bundle) => bundle.sources);
      const source = sources.find((item) =>
        item.lines.some((line) => line.text.includes("calculateTotal")),
      );
      assert.ok(source);
      const line = source.lines.find((item) => item.text.includes("calculateTotal"))!;
      return JSON.stringify({
        part_evidence: [{ part_id: "P1", evidence_refs: [calls === 1 ? "E999" : line.ref] }],
        confidence: "medium",
        unresolved: [],
        next_action: { ref: "" },
      });
    };
    const result = await runLocalExploreRepo(
      { repository_root: root, query: "Where is calculateTotal defined?" },
      stub,
    );
    assert.equal(result.status, "evidence_selected");
    assert.equal(result.model_calls, 2);
    assert.equal(result.evidence[0].file, "src/pricing.ts");
    assert.equal(readFileSync(join(root, "src/pricing.ts"), "utf8"), before);
    let unresolvedCalls = 0;
    const unresolved = await runLocalExploreRepo(
      { repository_root: root, query: "Where does calculateTotal call chargeTax?" },
      async (_model, prompt) => {
        unresolvedCalls++;
        const source = promptBundles(prompt)
          .flatMap((bundle) => bundle.sources)
          .find((item) => item.lines.some((line) => line.text.includes("calculateTotal")))!;
        const ref = source.lines.find((line) => line.text.includes("calculateTotal"))!.ref;
        return JSON.stringify({
          part_evidence: [{ part_id: "P1", evidence_refs: [ref] }],
          confidence: "high",
          unresolved: ["No chargeTax call is present."],
          next_action: { ref: "" },
        });
      },
    );
    assert.equal(unresolved.status, "needs_review");
    assert.equal(unresolvedCalls, 2);
    assert.match(unresolved.warning ?? "", /No chargeTax call/);
    assert.ok(
      unresolved.evidence.length,
      "Keep nearby citations for parent review without marking the request supported.",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("decomposes independent evidence requirements", () => {
  assert.deepEqual(decomposeQuestion("Where is x registered, and is it enabled by default?"), [
    {
      id: "P1",
      question: "Where is x registered",
      evidence_needed:
        "The call that registers the named tool and its guard; an import or function definition alone is insufficient.",
    },
    {
      id: "P2",
      question: "is it enabled by default",
      evidence_needed:
        "The named flag mapping, the helper resolving that mapping, and the expression establishing the master flag default.",
    },
  ]);
});

test("lock question packs source and caller with an explicit 50K byte budget", async () => {
  const root = process.cwd();
  const stub: typeof generate = async (_model, prompt) => {
    const sources = promptBundles(prompt).flatMap((bundle) => bundle.sources);
    const lock = sources.find(
      (source) =>
        source.file === "src/quality-review/storage.ts" &&
        source.lines.some((line) => line.text.includes("Another scan/worker owns the queue")),
    );
    const caller = sources.find(
      (source) =>
        source.file === "src/quality-review/service.ts" &&
        source.lines.some((line) => line.text.includes("this.store.lock()")),
    );
    assert.ok(lock, "Store.lock must reach the context");
    assert.ok(caller, "its service caller must reach the context");
    const required = [
      "this.transaction(",
      "BEGIN IMMEDIATE",
      "INSERT INTO worker_lock",
      "Another scan/worker owns the queue",
    ];
    const refs = required.map((text) => {
      const line = sources
        .filter((source) => source.file === "src/quality-review/storage.ts")
        .flatMap((source) => source.lines)
        .find((line) => line.text.includes(text));
      assert.ok(line, `${text} must reach context`);
      return line.ref;
    });
    const callerRef = caller.lines.find((line) => line.text.includes("this.store.lock()"))!.ref;
    return JSON.stringify({
      part_evidence: [{ part_id: "P1", evidence_refs: [...refs, callerRef] }],
      confidence: "medium",
      unresolved: [],
      next_action: { ref: "" },
    });
  };
  const result = await runLocalExploreRepo(
    {
      repository_root: root,
      query: "How does Quality Review prevent duplicate concurrent workers?",
      num_ctx: 50000,
    },
    stub,
  );
  assert.equal(result.status, "evidence_selected");
});

test("expands one requested source window for a missing question part", async () => {
  const root = mkdtempSync(join(tmpdir(), "local-explore-expand-"));
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src/work.ts"),
      "export function work() {\n  const ready = true;\n  return ready;\n}\n",
    );
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "add", "src/work.ts"]);
    execFileSync("git", [
      "-C",
      root,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-qm",
      "fixture",
    ]);
    let calls = 0;
    const stub: typeof generate = async (_model, prompt) => {
      calls++;
      const bundles = promptBundles(prompt);
      const sources = bundles.flatMap((bundle) => bundle.sources);
      const source = sources.find((item) =>
        item.lines.some((line) => line.text.includes("function work")),
      )!;
      const ref = source.lines.find((line) => line.text.includes("function work"))!.ref;
      if (calls === 1)
        return JSON.stringify({
          part_evidence: [{ part_id: "P1", evidence_refs: [] }],
          confidence: "low",
          unresolved: ["Need a wider view"],
          next_action: { ref },
        });
      assert.ok(bundles.some((bundle) => bundle.why_retrieved === "bounded follow-up read"));
      return JSON.stringify({
        part_evidence: [{ part_id: "P1", evidence_refs: [ref] }],
        confidence: "medium",
        unresolved: [],
        next_action: { ref: "" },
      });
    };
    const result = await runLocalExploreRepo(
      { repository_root: root, query: "Where is work defined?" },
      stub,
    );
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
  assert.equal(
    directEvidenceForPart(
      part,
      [cite('"ENABLE_EXPERIMENTAL"'), cite('"CLOUD_CLAUDE_ENABLED"')],
      query,
    ),
    false,
  );
  assert.equal(
    directEvidenceForPart(
      part,
      [cite('"LOCAL_WORKER_ENABLED"'), cite('"CLOUD_CLAUDE_ENABLED"')],
      query,
    ),
    true,
  );
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
      const lines = promptBundles(prompt)
        .flatMap((bundle) => bundle.sources)
        .flatMap((source) => source.lines);
      const required = query.includes("autonomous")
        ? [
            "LOCAL_WORKER_ENABLED",
            "CLOUD_CLAUDE_ENABLED",
            "if (features.localWorker)",
            "registerRunLocalWorkerTask(server)",
            "if (features.cloudClaudeWorker)",
            "registerRunCloudClaudeTask(server)",
          ]
        : [
            "const experimentalFeature",
            "?? experimental",
            "localExplorerTask: experimentalFeature",
            "?? false",
          ];
      for (const text of required)
        assert.ok(
          lines.some((line) => line.text.includes(text)),
          `${text} must reach context`,
        );
      return JSON.stringify({ part_evidence: [], unresolved: [], next_action: { ref: "" } });
    };
    const result = await runLocalExploreRepo({ repository_root: process.cwd(), query }, stub);
    assert.ok(calls > 0, "packing assertions must execute");
    assert.equal(result.model_calls, calls);
    assert.equal(result.status, "needs_review");
    assert.deepEqual(result.evidence, []);
  }
});

test("reports overflow without calling the model or reducing an explicit output ceiling", async () => {
  let calls = 0;
  const result = await runLocalExploreRepo(
    {
      repository_root: process.cwd(),
      query: "Where is embed keep_alive set?",
      model: "qwen-context:i-q8_0-32k",
      num_ctx: 26030,
      num_predict: 25000,
    },
    async () => {
      calls++;
      return "{}";
    },
  );
  assert.equal(result.status, "input_overflow");
  assert.equal(result.model_calls, 0);
  assert.equal(calls, 0);
  assert.equal(result.input_checks[0].num_predict, 25000);
});

test("requires transaction serialization in addition to a lock rejection and caller", () => {
  const part = decomposeQuestion(
    "How does Quality Review prevent duplicate concurrent workers?",
  )[0];
  const evidence = ["throw new Error('locked')", "this.store.lock()"].map((quote) => ({
    id: "C1",
    file: "storage.ts",
    line: 1,
    quote,
  }));
  assert.equal(directEvidenceForPart(part, evidence, part.question), false);
});

test("deduplicated source is charged once and packing overflow is explicit", () => {
  const parts = decomposeQuestion("Where is x registered, and is it enabled by default?");
  const candidate: Candidate = {
    id: "C1",
    kind: "symbol",
    file: "source.ts",
    lines: Array.from({ length: 10 }, (_, index) => ({ line: index + 1, text: "x".repeat(1500) })),
  };
  const compiled = compileEvidenceBundles(
    parts,
    new Map(parts.map((part) => [part.id, [candidate]])),
  );
  assert.equal(compiled.overflow, false);
  assert.equal(compiled.bundles.length, 2);
  assert.equal(compiled.candidates.length, 1);
  const oversized = {
    ...candidate,
    lines: candidate.lines.map((line) => ({ ...line, text: "x".repeat(2500) })),
  };
  assert.equal(compileEvidenceBundles(parts, new Map([[parts[0].id, [oversized]]])).overflow, true);
});

test("keeps a supported environment mapping when a retry resolves registrations", async () => {
  let calls = 0;
  const stub: typeof generate = async (_model, prompt) => {
    calls++;
    const sources = promptBundles(prompt).flatMap((bundle) => bundle.sources);
    const ref = (text: string) => {
      const line = sources
        .flatMap((source) => source.lines)
        .find((line) => line.text.includes(text));
      assert.ok(line, `${text} must reach context`);
      return line.ref;
    };
    const mapping = [ref("localWorker: autonomousFlag"), ref("cloudClaudeWorker: autonomousFlag")];
    const registrations = [
      "if (features.localWorker)",
      "registerRunLocalWorkerTask(server)",
      "if (features.cloudClaudeWorker)",
      "registerRunCloudClaudeTask(server)",
    ].map(ref);
    return JSON.stringify({
      part_evidence: [
        { part_id: "P1", evidence_refs: calls === 1 ? mapping : [] },
        { part_id: "P2", evidence_refs: calls === 1 ? [] : registrations },
      ],
      next_action: { ref: "" },
    });
  };
  const result = await runLocalExploreRepo(
    {
      repository_root: process.cwd(),
      query:
        "Which environment variables gate the autonomous tools, and which tool does each gate?",
    },
    stub,
  );
  assert.equal(result.status, "evidence_selected");
  assert.equal(result.evidence.length, 6);
  assert.equal(result.model_calls, 2);
});

test("unrelated throws do not establish competing-worker rejection", () => {
  const query = "How does Quality Review prevent duplicate concurrent workers?";
  const evidence = [
    "this.transaction(() => {",
    "BEGIN IMMEDIATE",
    "INSERT INTO worker_lock",
    "else throw error",
    "this.store.lock()",
  ].map((quote) => ({ id: "C1", file: "storage.ts", line: 1, quote }));
  assert.equal(directEvidenceForPart(decomposeQuestion(query)[0], evidence, query), false);
});

test("combines checked partial locking citations with an explicit 50K byte budget", async () => {
  let calls = 0;
  const result = await runLocalExploreRepo(
    {
      repository_root: process.cwd(),
      query: "How does Quality Review prevent duplicate concurrent workers?",
      num_ctx: 50000,
    },
    async (_model, prompt) => {
      calls++;
      const lines = promptBundles(prompt)
        .flatMap((bundle) => bundle.sources)
        .flatMap((source) => source.lines);
      const texts =
        calls === 1
          ? ["this.transaction(", "BEGIN IMMEDIATE", "INSERT INTO worker_lock"]
          : ["Another scan/worker owns the queue", "this.store.lock()"];
      const refs = texts.map((text) => lines.find((line) => line.text.includes(text))!.ref);
      return JSON.stringify({
        part_evidence: [{ part_id: "P1", evidence_refs: refs }],
        next_action: { ref: "" },
      });
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.status, "evidence_selected");
  assert.equal(result.evidence.length, 5);
});

test("packs every chain file for each part instead of dividing file slots between parts", () => {
  const parts = decomposeQuestion("Where is a, and where is b, and where is c, and where is d?");
  const pool: Candidate[] = Array.from({ length: 6 }, (_, index) => ({
    id: `C${index + 1}`,
    kind: "symbol",
    file: `file${index}.ts`,
    lines: [{ line: 1, text: `export const item${index} = 1;` }],
  }));
  const packed = compileEvidenceBundles(parts, new Map(parts.map((part) => [part.id, pool])));
  assert.equal(packed.overflow, false);
  assert.equal(packed.candidates.length, 6);
  assert.ok(packed.bundles.every((bundle) => bundle.candidates.length === 6));
  const overlapping = {
    ...pool[0],
    lines: [...pool[0].lines, { line: 2, text: "export const extra = 2;" }],
  };
  const merged = compileEvidenceBundles(
    parts,
    new Map([
      ["P1", [pool[0]]],
      ["P2", [overlapping]],
    ]),
  );
  assert.equal(merged.candidates.length, 1);
  assert.equal(merged.candidates[0].lines.length, 2);
  assert.equal(merged.bundles[0].candidates[0], merged.bundles[1].candidates[0]);
  const tooMany = Array.from({ length: 7 }, (_, i) => ({
    id: `P${i}`,
    question: "Where?",
    evidence_needed: "source",
  }));
  assert.equal(compileEvidenceBundles(tooMany, new Map()).overflow, true);
});

test("named calls require an executable call rather than a declaration or comment", () => {
  const query = "Where does preparePage call renderPage?";
  const part = decomposeQuestion(query)[0];
  const cite = (quote: string) => ({ id: "C1", file: "page.ts", line: 1, quote });
  for (const quote of [
    "export function renderPage() {",
    "async renderPage(): Promise<void> {",
    "// return renderPage();",
    "import { renderPage } from './render.js';",
  ]) {
    assert.deepEqual(missingEvidenceRequirements(part, [cite(quote)], query), ["renderPage call"]);
  }
  assert.equal(directEvidenceForPart(part, [cite("return renderPage(input);")], query), true);
});

test("missing operation is retained as unresolved even when the model claims complete nearby evidence", async () => {
  const root = mkdtempSync(join(tmpdir(), "local-explore-missing-call-"));
  try {
    writeFileSync(
      join(root, "page.ts"),
      "export function preparePage() {\n  return { pageMarkup: 'ready' };\n}\n",
    );
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "add", "page.ts"]);
    execFileSync("git", [
      "-C",
      root,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-qm",
      "fixture",
    ]);
    let calls = 0;
    const result = await runLocalExploreRepo(
      { repository_root: root, query: "Where does preparePage call renderPage?" },
      async (_model, prompt) => {
        calls++;
        if (calls === 2)
          assert.match(
            prompt,
            /Unresolved evidence requirements: P1: preparePage -> renderPage caller identity/,
          );
        const lines = promptBundles(prompt)
          .flatMap((bundle) => bundle.sources)
          .flatMap((source) => source.lines);
        return JSON.stringify({
          part_evidence: [
            {
              part_id: "P1",
              evidence_refs: [lines.find((line) => line.text.includes("pageMarkup"))!.ref],
            },
          ],
          confidence: "high",
          unresolved: [],
          next_action: { ref: "" },
        });
      },
    );
    assert.equal(calls, 2);
    assert.equal(result.status, "needs_review");
    assert.ok(result.unresolved.some((item) => item.includes("renderPage call")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("follows two local import hops to configuration without promoting adjacency to a resolved call", async () => {
  const root = mkdtempSync(join(tmpdir(), "local-explore-chain-"));
  try {
    const sources = {
      "page.ts":
        "import { renderPage as render } from './render.js';\nexport function preparePage() {\n  return { pageMarkup: render() };\n}\n",
      "render.ts":
        "import { policy } from './policy.js';\nexport function renderPage() {\n  return 'page'.repeat(policy.maxDepth);\n}\n",
      "policy.ts": "export const policy = {\n  maxDepth: 3,\n};\n",
    };
    for (const [file, source] of Object.entries(sources)) writeFileSync(join(root, file), source);
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "add", "."]);
    execFileSync("git", [
      "-C",
      root,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-qm",
      "fixture",
    ]);
    const result = await runLocalExploreRepo(
      { repository_root: root, query: "How does preparePage return pageMarkup?" },
      async (_model, prompt) => {
        const sources = promptBundles(prompt).flatMap((bundle) => bundle.sources);
        assert.ok(
          sources.some(
            (source) =>
              source.file === "policy.ts" &&
              source.lines.some((line) => line.text.includes("maxDepth: 3")),
          ),
        );
        assert.match(prompt, /import adjacency does not prove a runtime call/);
        const line = sources
          .flatMap((source) => source.lines)
          .find((line) => line.text.includes("pageMarkup: render()"))!;
        return JSON.stringify({
          part_evidence: [{ part_id: "P1", evidence_refs: [line.ref] }],
          unresolved: [],
          next_action: { ref: "" },
        });
      },
    );
    assert.equal(result.status, "evidence_selected");
    for (const [file, source] of Object.entries(sources))
      assert.equal(readFileSync(join(root, file), "utf8"), source);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("requires configuration assignment and use separately", () => {
  const query = "How is displayWidth configured and used in renderPage?";
  const part = decomposeQuestion(query)[0];
  const cite = (quote: string) => ({ id: "C1", file: "render.ts", line: 1, quote });
  assert.equal(directEvidenceForPart(part, [cite("displayWidth: 12,")], query), false);
  assert.equal(
    directEvidenceForPart(
      part,
      [cite("displayWidth: 12,"), cite("return policy.displayWidth;")],
      query,
    ),
    true,
  );
  assert.equal(
    directEvidenceForPart(
      part,
      [cite("// displayWidth: 12,"), cite("return policy.displayWidth;")],
      query,
    ),
    false,
  );
});

test("turns ordinary image and query questions into explicit operation checklists", () => {
  const parts = decomposeQuestion(
    "How does POST /teams accept an image, validate it, upload it, and save its URL and ID?",
  );
  assert.deepEqual(
    parts.map((part) => part.operation),
    ["acceptance", "validation", "upload", "storage"],
  );
  assert.ok(parts.every((part) => part.completeness === "unchecked"));
  assert.deepEqual(
    evidenceChecklist(parts[3], [], "").map((check) => check.requirement),
    ["record persistence", "stored image URL", "stored image ID"],
  );
  assert.deepEqual(
    decomposeQuestion(
      "How does the list turn query parameters into a filter and paginated response?",
    ).map((part) => part.operation),
    ["transformation", "filter", "pagination", "response"],
  );
});

test("empty checklists and unchecked semantic scope cannot establish completeness", () => {
  const cite = (quote: string) => ({ id: "C1", file: "source.ts", line: 1, quote });
  const query = "How does calculateTotal apply loyalty discounts?";
  const part = decomposeQuestion(query)[0];
  assert.deepEqual(missingEvidenceRequirements(part, [cite("return quantity * 5;")], query), [
    "semantic completeness unchecked; parent review required",
  ]);
  const upload = decomposeQuestion("How does the service upload an image?")[0];
  assert.equal(
    directEvidenceForPart(upload, [cite("return client.upload(file.path);")], upload.question),
    false,
  );
  assert.equal(
    evidenceChecklist(upload, [{ ref: "E1", quote: "// client.upload(file.path);" }], "").every(
      (check) => !check.candidate_refs.length,
    ),
    true,
  );
});

test("packs separated operations in a long method and refuses unchecked completeness", async () => {
  const root = mkdtempSync(join(tmpdir(), "local-explore-operations-"));
  try {
    const source = [
      "export async function storeImage(file: { path: string }) {",
      "  const uploaded = await client.upload(file.path);",
      ...Array.from({ length: 70 }, (_, i) => `  const unrelated${i} = ${i};`),
      "  return database.create({",
      "    image: uploaded.secureUrl,",
      "    imageId: uploaded.publicId,",
      "  });",
      "}",
    ].join("\n");
    writeFileSync(join(root, "image.ts"), source);
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "add", "."]);
    execFileSync("git", [
      "-C",
      root,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-qm",
      "fixture",
    ]);
    const query = "How does storeImage upload an image and save its URL and ID?";
    const result = await runLocalExploreRepo(
      { repository_root: root, query },
      async (_model, prompt) => {
        const lines = promptBundles(prompt)
          .flatMap((bundle) => bundle.sources)
          .flatMap((source) => source.lines);
        const parts = decomposeQuestion(query);
        const required = [
          "client.upload(file.path)",
          "database.create(",
          "image: uploaded.secureUrl",
          "imageId: uploaded.publicId",
        ];
        for (const text of required)
          assert.ok(
            lines.some((line) => line.text.includes(text)),
            `${text} must be packed`,
          );
        return JSON.stringify({
          part_evidence: parts.map((part) => ({
            part_id: part.id,
            evidence_refs: [
              ...new Set(
                lines
                  .filter((line) => required.some((text) => line.text.includes(text)))
                  .map((line) => line.ref),
              ),
            ],
          })),
          confidence: "high",
          unresolved: [],
          next_action: { ref: "" },
        });
      },
    );
    assert.equal(result.status, "needs_review");
    assert.equal(result.model_calls, 2);
    assert.ok(result.evidence.some((cite) => cite.quote.includes("imageId: uploaded.publicId")));
    assert.ok(
      result.unresolved.every((reason) => reason.includes("semantic completeness unchecked")),
    );
    assert.equal(readFileSync(join(root, "image.ts"), "utf8"), source);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("high-confidence nearby evidence for an unsupported behavior returns review", async () => {
  const root = mkdtempSync(join(tmpdir(), "local-explore-unchecked-"));
  try {
    writeFileSync(
      join(root, "price.ts"),
      "export function calculateTotal(quantity: number) {\n  return quantity * 5;\n}\n",
    );
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "add", "."]);
    execFileSync("git", [
      "-C",
      root,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-qm",
      "fixture",
    ]);
    const result = await runLocalExploreRepo(
      { repository_root: root, query: "How does calculateTotal apply loyalty discounts?" },
      async (_model, prompt) => {
        const line = promptBundles(prompt)
          .flatMap((bundle) => bundle.sources)
          .flatMap((source) => source.lines)
          .find((line) => line.text.includes("quantity * 5"))!;
        return JSON.stringify({
          part_evidence: [{ part_id: "P1", evidence_refs: [line.ref] }],
          confidence: "high",
          unresolved: [],
          next_action: { ref: "" },
        });
      },
    );
    assert.equal(result.status, "needs_review");
    assert.ok(result.unresolved.some((item) => item.includes("completeness unchecked")));
    assert.ok(result.evidence.length);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a retrieved inner variable cannot suppress operation windows elsewhere in that file", () => {
  const root = mkdtempSync(join(tmpdir(), "local-explore-inner-variable-"));
  try {
    const source = [
      "export async function uploadAndStore(file) {",
      "  const uploaded = await client.upload(file.path);",
      ...Array.from({ length: 50 }, (_, i) => `  const filler${i} = ${i};`),
      "  const marker = 1;",
      "  return database.create({",
      "    image: uploaded.secureUrl,",
      "    imageId: uploaded.publicId,",
      "  });",
      "}",
    ].join("\n");
    writeFileSync(join(root, "image.ts"), source);
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "add", "."]);
    execFileSync("git", [
      "-C",
      root,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-qm",
      "fixture",
    ]);
    const index = indexRepository(root);
    const variable = index.symbols.find((symbol) => symbol.name === "marker")!;
    const part = decomposeQuestion("How does uploadAndStore upload an image?")[0];
    const candidates = buildCandidates(
      root,
      [
        {
          score: 1,
          sources: [],
          evidence: { kind: "symbol", file: variable.file, symbol: variable },
        },
      ],
      index,
      "marker",
      part,
    );
    assert.ok(
      candidates.some((candidate) =>
        candidate.lines.some((line) => line.text.includes("client.upload(file.path)")),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("repeated operations across dependent clauses share a part with full question context", () => {
  const query =
    "How does the endpoint accept an image and upload it, and how does it save its URL and ID after upload, and what happens if upload fails?";
  const parts = decomposeQuestion(query);
  assert.deepEqual(
    parts.map((part) => part.operation),
    ["acceptance", "upload", "storage", "failure"],
  );
  assert.ok(parts.every((part) => part.question === query && part.completeness === "unchecked"));
  assert.equal(compileEvidenceBundles(parts, new Map()).overflow, false);
});

test("a checked named call cannot silently satisfy additional behavior", () => {
  const query = "Where does preparePage call renderPage and encrypt the result?";
  const part = decomposeQuestion(query)[0];
  assert.equal(part.completeness, "unchecked");
  assert.equal(
    directEvidenceForPart(
      part,
      [{ id: "C1", file: "page.ts", line: 1, quote: "return renderPage();" }],
      query,
    ),
    false,
  );
  assert.equal(
    decomposeQuestion("Where does preparePage call renderPage and return pageMarkup?")[0]
      .completeness,
    undefined,
  );
});
