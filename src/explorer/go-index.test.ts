import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { indexRepository } from "./indexer.js";
import { outlineFile } from "./outline-file.js";
import { readSymbol } from "./read-symbol.js";
import { hybridRetrieve } from "./retrieval.js";

const source = [
  "package billing",
  "// Café 🧾 keeps byte offsets distinct from character offsets.",
  'import (alias "example.com/billing/helper"; `fmt`)',
  "type Invoice struct { Amount int }",
  "type Sender interface { Send(int) error }",
  "type Count = int",
  "type (",
  "  Token string",
  ")",
  "const (",
  "  Rate = 2",
  "  Limit = 3",
  ")",
  "var First, Second = 1, 2",
  "var (",
  "  Third = 3",
  ")",
  "func (i *Invoice) Send(amount int) error {",
  "  alias.Send(amount)",
  "  return nil",
  "}",
  "func Total(amount int) int {",
  "  helper := func() int {",
  "    return Total(1)",
  "  }",
  "  type Local int",
  "  const local = 2",
  "  return helper() + amount",
  "}",
  "func Shadow(helper func() int) int { return helper() }",
  "func helper() int { return 1 }",
  "func Require() { require(\"./helper\"); fmt.Println(First) }",
  "",
].join("\n");

test("Go index preserves declarations, ranges and unresolved source relationships", async () => {
  const root = mkdtempSync(join(tmpdir(), "go-index-"));
  try {
    writeFileSync(join(root, "billing.go"), source);
    writeFileSync(join(root, "other.go"), "package billing\nfunc helper() int { return 2 }\n");
    writeFileSync(join(root, "untracked.go"), "package billing\nfunc Untracked() {}\n");
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "billing.go", "other.go"], { cwd: root });
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@t", "commit", "-qm", "fixture"], { cwd: root });
    const index = indexRepository(root);
    assert.equal(index.files_indexed, 2);
    assert.ok(index.symbols.every((symbol) => symbol.language === "go"));
    const byName = new Map(index.symbols.filter((symbol) => symbol.file === "billing.go").map((symbol) => [symbol.qualified_name, symbol]));
    assert.deepEqual([...byName.keys()], ["Invoice", "Sender", "Count", "Token", "Rate", "Limit", "First", "Second", "Third", "Invoice.Send", "Total", "Shadow", "helper", "Require"]);
    assert.equal(byName.get("Invoice")?.kind, "type");
    assert.equal(byName.get("Sender")?.kind, "interface");
    assert.equal(byName.get("Rate")?.kind, "constant");
    assert.equal(byName.get("Second")?.kind, "variable");
    const method = byName.get("Invoice.Send");
    assert.ok(method);
    assert.equal(method.name, "Send");
    assert.equal(method.kind, "method");
    assert.equal(method.signature, "func (i *Invoice) Send(amount int) error");
    assert.equal(method.range.start.line, 18);
    assert.equal(method.range.end.line, 21);
    const bytes = Buffer.from(source);
    assert.equal(bytes.subarray(method.selection_range.start.byte, method.selection_range.end.byte).toString(), "Send");
    assert.equal(readSymbol(root, method.id, index).source.text, source.split("\n").slice(17, 21).join("\n"));
    assert.ok(outlineFile(root, "billing.go", index).symbols.some((symbol) => symbol.id === method.id));
    const retrieval = await hybridRetrieve(root, "Invoice Send", 10, "basic", undefined, index);
    assert.ok(retrieval.results.some((result) => result.symbol?.id === method.id));
    assert.deepEqual(index.dependencies.map((dependency) => dependency.module_specifier), ["example.com/billing/helper", "fmt"]);
    assert.ok(index.dependencies.every((dependency) => dependency.target_file === null && dependency.resolution === "unresolved"));
    assert.ok(index.calls.some((call) => call.callee_name === "alias.Send" && call.caller_symbol_id === method.id));
    assert.ok(index.calls.filter((call) => call.callee_name === "helper").length >= 2);
    assert.ok(index.calls.every((call) => call.callee_symbol_id === null && call.resolution === "unresolved" && call.guard_condition === null));
    assert.equal(index.calls.find((call) => call.callee_name === "Total")?.caller_symbol_id, null);
    assert.ok(index.references.every((reference) => reference.target_symbol_id === null && reference.resolution === "unresolved"));
    for (const call of index.calls.filter((call) => call.file === "billing.go"))
      assert.equal(bytes.subarray(call.range.start.byte, call.range.end.byte).toString(), call.callee_name);
    for (const reference of index.references.filter((reference) => reference.file === "billing.go"))
      assert.equal(bytes.subarray(reference.range.start.byte, reference.range.end.byte).toString(), reference.name);
    for (const dependency of index.dependencies)
      assert.equal(bytes.subarray(dependency.range.start.byte + 1, dependency.range.end.byte - 1).toString(), dependency.module_specifier);
    assert.equal(readFileSync(join(root, "billing.go"), "utf8"), source);
    assert.deepEqual(indexRepository(root), index);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
