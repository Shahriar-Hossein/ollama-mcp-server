import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { indexRepository } from "../../explorer/indexer.js";
import { resolveModelBudget } from "../../ollama-client.js";
import { buildCandidates, decomposeQuestion, runLocalExploreRepo } from "./local-explore-repo.js";
import { createRelationshipChecks } from "./local-explore-relationships.js";
import type { ValidEvidence } from "./local-explore-validation.js";

async function fixture(source: string, check: (root: string) => void | Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "h-conditions-"));
  try {
    writeFileSync(join(root, "media.ts"), source);
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
    await check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const absentQuery =
  "If `update` is called without a replacement file, what happens when the team does not exist, and which image fields are written when it does exist?";
const deleteQuery =
  "When `deleteImage` calls Cloudinary, which result statuses count as success, what options are sent, and how are other results or provider errors reported?";
const deletion = (name = "deleteImage") =>
  [
    `  async ${name}(publicId: string) {`,
    "    try {",
    "      const result = await cloudinary.uploader.destroy(publicId, {",
    "        resource_type: 'image',",
    "        invalidate: true,",
    "      });",
    "      const status = result?.result;",
    "      if (status !== 'ok' && status !== 'not found') {",
    "        throw new Error('Unexpected provider delete result');",
    "      }",
    "    } catch {",
    "      throw new Error('Image delete failed');",
    "    }",
    "  }",
  ].join("\n");
const evidence = (source: string): ValidEvidence[] =>
  source.split("\n").map((quote, offset) => ({
    id: "C1",
    file: "media.ts",
    line: offset + 1,
    quote,
  }));

test("negated replacement and provider labels preserve their operation context", () => {
  assert.deepEqual(
    decomposeQuestion(absentQuery).map((part) => part.operation),
    ["storage"],
  );
  assert.deepEqual(
    decomposeQuestion(deleteQuery).map((part) => part.operation),
    ["provider-deletion"],
  );
  for (const negation of ["without a replacement image", "with no new file", "without any file"]) {
    assert.deepEqual(
      decomposeQuestion(`How does update save a team record ${negation}?`).map(
        (part) => part.operation,
      ),
      ["storage"],
    );
  }
  assert.deepEqual(
    decomposeQuestion("How does update save a record without uploading an image?").map(
      (part) => part.operation,
    ),
    ["storage"],
  );
  assert.equal(
    decomposeQuestion("Where does preparePage call renderPage and return pageMarkup?")[0].operation,
    undefined,
  );
  assert.ok(
    decomposeQuestion("How does update replace an image and save a record?").some(
      (part) => part.operation === "replacement",
    ),
  );
});

test("packing retains absent-file state and distant empty fallback windows", async () => {
  const source = [
    "export class Media {",
    "  async update(id, dto, file) {",
    "    const existingTeam = await database.findUnique({ where: { id } });",
    "    if (!existingTeam) {",
    "      throw new NotFoundException('Team not found');",
    "    }",
    "    let uploaded:",
    "      { secureUrl: string; publicId: string }",
    "      | undefined;",
    "    if (file) {",
    "      uploaded = await provider.uploadImage(file);",
    "    }",
    ...Array.from({ length: 65 }, (_, i) => `    const unrelated${i} = ${i};`),
    "    return database.update({",
    "      ...dto,",
    "      ...(uploaded",
    "        ? { image: uploaded.secureUrl, imageId: uploaded.publicId }",
    "        : {}),",
    "    });",
    "  }",
    "}",
  ].join("\n");
  await fixture(source, (root) => {
    const part = decomposeQuestion(absentQuery)[0];
    const candidates = buildCandidates(root, [], indexRepository(root), absentQuery, part);
    const quotes = candidates.flatMap((candidate) => candidate.lines.map((line) => line.text));
    for (const text of [
      "async update",
      "if (!existingTeam)",
      "let uploaded:",
      "| undefined;",
      "if (file)",
      "database.update(",
      "...(uploaded",
      ": {}),",
    ]) {
      assert.ok(
        quotes.some((quote) => quote.includes(text)),
        `${text} must be packed`,
      );
    }
  });
});

test("method requirements reject a different method's guards and errors", async () => {
  const source = `export class Media {\n  async deleteImage(publicId) {\n    return cloudinary.uploader.destroy(publicId);\n  }\n${deletion("deleteOtherImage")}\n}`;
  await fixture(source, (root) => {
    const checks = createRelationshipChecks(root, indexRepository(root));
    const part = decomposeQuestion(deleteQuery)[0];
    const lines = evidence(source).map((line, i) => ({ ...line, ref: `E${i}` }));
    assert.ok(checks.missing(part, lines).includes("accepted deletion statuses"));
    assert.deepEqual(
      checks
        .checklist(part, lines)
        .find((check) => check.requirement === "deletion failure reported")?.alternative_ref_sets,
      [],
    );
    assert.ok(!checks.missing(part, lines).some((item) => item.includes("Cloudinary call")));
  });
});

test("matching named methods cannot combine partial branches into one complete method", async () => {
  const first = deletion().replace("        invalidate: true,\n", "");
  const second = deletion().replace("        resource_type: 'image',\n", "");
  const source = `export class First {\n${first}\n}\nexport class Second {\n${second}\n}`;
  await fixture(source, (root) => {
    const checks = createRelationshipChecks(root, indexRepository(root));
    assert.deepEqual(checks.missing(decomposeQuestion(deleteQuery)[0], evidence(source)), [
      "operation evidence must belong to one requested method: deleteImage",
    ]);
  });
});

test("a nested function cannot supply the requested method's condition", async () => {
  const source = `export class Media {\n  async update(file) {\n    function unrelated() {\n      if (!existingTeam) {\n        throw new NotFoundException('Team not found');\n      }\n    }\n  }\n}`;
  await fixture(source, (root) => {
    const checks = createRelationshipChecks(root, indexRepository(root));
    assert.ok(
      checks
        .missing(decomposeQuestion(absentQuery)[0], evidence(source))
        .includes("missing record guard"),
    );
  });
});

test("cleanup contrast separates helper catches from upload and deletion errors", async () => {
  const query =
    "If removing the local temporary upload file fails after a Cloudinary upload, is that failure reported to the caller? Contrast it with a Cloudinary upload failure.";
  const source = [
    "export class Media {",
    "  async uploadImage(file) {",
    "    try {",
    "      return await cloudinary.uploader.upload(file.path);",
    "    } catch (error) {",
    "      if (error instanceof BadRequestException) {",
    "        throw error;",
    "      }",
    "      throw new Error('Image upload failed');",
    "    } finally {",
    "      await this.removeLocalTempFile(file.path);",
    "    }",
    "  }",
    "  private async removeLocalTempFile(path) {",
    "    try {",
    "      await unlink(path);",
    "    } catch {",
    "      // Ignore temp file cleanup failures.",
    "    }",
    "  }",
    deletion(),
    "}",
  ].join("\n");
  await fixture(source, (root) => {
    const checks = createRelationshipChecks(root, indexRepository(root));
    const lines = evidence(source).map((line, i) => ({ ...line, ref: `E${i}` }));
    const parts = decomposeQuestion(query);
    const failure = parts.find((part) => part.operation === "failure")!;
    const cleanup = parts.find((part) => part.operation === "cleanup-failure")!;
    assert.deepEqual(checks.missing(cleanup, lines), []);
    assert.deepEqual(checks.missing(failure, lines), []);
    const reported = checks
      .checklist(failure, lines)
      .find((check) => check.requirement === "failure reported")!;
    const deletionError = lines.find((line) => line.quote.includes("Image delete failed"))!.ref;
    assert.ok(reported.alternative_ref_sets.length);
    assert.ok(reported.alternative_ref_sets.every((refs) => !refs.includes(deletionError)));
    const candidates = buildCandidates(root, [], indexRepository(root), query, cleanup);
    assert.ok(
      candidates.some((candidate) =>
        candidate.lines.some((line) => line.text.includes("Ignore temp file cleanup failures")),
      ),
    );
  });
});

test("scout checks method declarations after selection and keeps completeness under review", async () => {
  await fixture(`export class Media {\n${deletion()}\n}`, async (root) => {
    let calls = 0;
    const result = await runLocalExploreRepo(
      { repository_root: root, query: deleteQuery },
      async (_model, prompt) => {
        calls++;
        const parts = JSON.parse(
          prompt.split("Question parts: ")[1].split("\nRelevant repo map: ")[0],
        );
        assert.equal(parts[0].checklist.length, 0);
        const sets = parts[0].relationships.flatMap((check: { alternative_ref_sets: string[][] }) =>
          check.alternative_ref_sets.slice(0, 1),
        );
        const refs = [...new Set(sets.flat())];
        assert.ok(refs.length <= 16);
        return JSON.stringify({
          part_evidence: [{ part_id: "P1", evidence_refs: refs }],
          confidence: "high",
          unresolved: [],
          next_action: { ref: "" },
        });
      },
      (model, overrides, _load, reserve) =>
        resolveModelBudget(
          model,
          overrides,
          async () => ({ parameters: "num_ctx 50000\nnum_predict 16000" }),
          reserve,
        ),
    );
    assert.equal(calls, 2);
    assert.equal(result.status, "needs_review");
    assert.ok(result.unresolved.length);
    assert.ok(result.unresolved.every((item) => item.includes("semantic completeness unchecked")));
    assert.ok(result.evidence.some((cite) => cite.quote.includes("async deleteImage")));
  });
});
