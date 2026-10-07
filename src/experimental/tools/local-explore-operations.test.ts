import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { indexRepository } from "../../explorer/indexer.js";
import {
  buildCandidates,
  compileEvidenceBundles,
  decomposeQuestion,
  directEvidenceForPart,
  unindexedLanguages,
} from "./local-explore-repo.js";
import { operationParts } from "./local-explore-operations.js";
import { evidenceChecklist, missingEvidenceRequirements } from "./local-explore-validation.js";

test("operation discovery finds unresolved root-path imports without resolving the provider", () => {
  const root = mkdtempSync(join(tmpdir(), "local-explore-provider-hint-"));
  try {
    mkdirSync(join(root, "src/providers"), { recursive: true });
    writeFileSync(
      join(root, "src/providers/remote.ts"),
      "export class Remote {\n  async uploadImage(file) {\n    return client.upload(file.path);\n  }\n}\n",
    );
    writeFileSync(
      join(root, "page.ts"),
      "import { Remote } from 'src/providers/remote';\nexport class Page {\n  constructor(private remote: Remote) {}\n  async create(file) {\n    return this.remote.uploadImage(file);\n  }\n}\n",
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
    const index = indexRepository(root);
    assert.ok(
      index.dependencies.some(
        (dependency) =>
          dependency.module_specifier === "src/providers/remote" && !dependency.target_file,
      ),
    );
    const seed = index.symbols.find((symbol) => symbol.qualified_name === "Page.create")!;
    const part = decomposeQuestion("How does Page upload an image?")[0];
    const candidates = buildCandidates(
      root,
      [{ score: 1, sources: [], evidence: { kind: "symbol", file: seed.file, symbol: seed } }],
      index,
      "Page",
      part,
    );
    assert.ok(
      candidates.some(
        (candidate) =>
          candidate.file === "src/providers/remote.ts" &&
          candidate.lines.some((line) => line.text.includes("client.upload(file.path)")),
      ),
    );
    assert.ok(
      index.calls
        .filter((call) => call.callee_name.includes("uploadImage"))
        .every((call) => !call.callee_symbol_id),
    );
    assert.equal(part.completeness, "unchecked");
    assert.equal(compileEvidenceBundles([part], new Map([[part.id, candidates]])).overflow, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("operation method hints retain competing providers as context within the file budget", () => {
  const root = mkdtempSync(join(tmpdir(), "local-explore-provider-names-"));
  try {
    writeFileSync(
      join(root, "page.ts"),
      "export async function preparePage(file, remote) {\n  return remote.uploadImage(file);\n}\n",
    );
    for (const provider of ["first", "second"])
      writeFileSync(
        join(root, `${provider}.ts`),
        `export class ${provider} {\n  async uploadImage(file) {\n    return client.upload(file.path);\n  }\n}\n`,
      );
    writeFileSync(
      join(root, "ignored.test.ts"),
      "export function uploadImage(file) { return client.upload(file.path); }\n",
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
    const index = indexRepository(root);
    const part = decomposeQuestion("How does preparePage upload an image?")[0];
    const candidates = buildCandidates(root, [], index, "preparePage", part);
    assert.ok(candidates.some((candidate) => candidate.file === "first.ts"));
    assert.ok(candidates.some((candidate) => candidate.file === "second.ts"));
    assert.ok(!candidates.some((candidate) => candidate.file.endsWith(".test.ts")));
    assert.ok(new Set(candidates.map((candidate) => candidate.file)).size <= 6);
    assert.equal(
      directEvidenceForPart(
        part,
        [{ id: "C1", file: "first.ts", line: 3, quote: "return client.upload(file.path);" }],
        part.question,
      ),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("image failure and replacement checklists require explicit conditions", () => {
  const missingImage = decomposeQuestion(
    "When a team is created without an image or its upload fails, what is stored?",
  ).find((part) => part.operation === "upload")!;
  const uploadChecks = evidenceChecklist(missingImage, [], "").map((item) => item.requirement);
  assert.ok(uploadChecks.includes("missing image guard"));
  assert.ok(uploadChecks.includes("missing image rejection"));
  assert.ok(uploadChecks.includes("upload result validity guard"));
  const replacement = decomposeQuestion(
    "How does the service update a record with a replacement image and save its URL and ID?",
  ).find((part) => part.operation === "storage")!;
  const nearby = [
    "return database.update({",
    "image: uploaded.secureUrl,",
    "imageId: uploaded.publicId,",
  ].map((quote, line) => ({ id: "C1", file: "page.ts", line, quote }));
  const missing = missingEvidenceRequirements(replacement, nearby, replacement.question);
  for (const requirement of [
    "existing record lookup",
    "missing record guard",
    "missing record rejection",
    "optional image guard",
    "conditional image fields",
  ])
    assert.ok(missing.includes(requirement));
  const lines = [
    "if (!file) {",
    "throw new Error('Image is required');",
    "if (!uploaded?.secure_url || !uploaded?.public_id) {",
    "throw new Error('Image upload failed');",
  ].map((quote, i) => ({ ref: `E${i}`, quote }));
  for (const item of evidenceChecklist(missingImage, lines, "").filter((item) =>
    [
      "missing image guard",
      "missing image rejection",
      "upload result validity guard",
      "upload failure reported",
    ].includes(item.requirement),
  ))
    assert.ok(item.candidate_refs.length, item.requirement);
});

test("generic storage verbs outside image or query workflows add no operation checklist", () => {
  assert.equal(
    operationParts("How does the cache store outlines in Redis and what TTL invalidates them?"),
    null,
  );
  assert.deepEqual(
    operationParts("Where is the uploaded image stored?")?.map((part) => part.operation),
    ["upload", "storage"],
  );
});

test("questions about tracked but unindexed languages are flagged", () => {
  const root = mkdtempSync(join(tmpdir(), "local-explore-unindexed-"));
  try {
    writeFileSync(join(root, "tool.rb"), "puts 1\n");
    writeFileSync(join(root, "admin.js"), "export const a = 1;\n");
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    assert.deepEqual(unindexedLanguages(root, "How does the Ruby tool sanitize sort?"), ["Ruby"]);
    assert.deepEqual(unindexedLanguages(root, "Which Python module loads config?"), []);
    assert.deepEqual(unindexedLanguages(root, "How is admin.js exported?"), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
