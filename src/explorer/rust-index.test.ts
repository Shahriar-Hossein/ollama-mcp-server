import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { indexRepository } from "./indexer.js";
import { outlineFile } from "./outline-file.js";
import { readSymbol } from "./read-symbol.js";
import { hybridRetrieve } from "./retrieval.js";

const source = [
  "// Café 🧾 preserves byte ranges.",
  "use crate::helper::{self, send as emit};",
  "mod external;",
  "mod inline { pub fn nested() {} }",
  "struct Café { amount: i32 }",
  "enum Choice { First, Second }",
  "type Alias = Café;",
  "const LIMIT: i32 = 2;",
  "static FLAG: bool = true;",
  "trait Sender { fn send(&self); }",
  "trait Other { fn send(&self) { helper(); } }",
  "impl Café {",
  "  fn send(&self) { helper(); }",
  "}",
  "impl Sender for Café {",
  "  fn send(&self) { self.send(); }",
  "}",
  "impl Other for Café {",
  "  fn send(&self) { emit(); }",
  "}",
  "fn résumé() {",
  '  let text = "é😀"; helper(text);',
  "  let callback = || {",
  "    helper();",
  "    fn nested() { emit(); }",
  "  };",
  "  callback();",
  '  if FLAG { helper("needleinside"); }',
  '  require("./helper");',
  '  println!("macro is not a call edge");',
  "}",
  "fn helper<T>(value: T) {}",
  "",
].join("\n");

test("Rust index keeps lexical impl identity and unresolved relationships with UTF-8 ranges", async () => {
  const root = mkdtempSync(join(tmpdir(), "rust-index-"));
  try {
    writeFileSync(join(root, "billing.rs"), source);
    writeFileSync(join(root, "other.rs"), "fn helper() {}\n");
    writeFileSync(join(root, "untracked.rs"), "fn untracked() {}\n");
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "billing.rs", "other.rs"], { cwd: root });
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@t", "commit", "-qm", "fixture"], { cwd: root });
    const index = indexRepository(root);
    assert.equal(index.files_indexed, 2);
    assert.ok(index.symbols.every((symbol) => symbol.language === "rust"));
    const named = new Map(index.symbols.filter((symbol) => symbol.file === "billing.rs").map((symbol) => [symbol.qualified_name, symbol]));
    assert.deepEqual([...named.keys()], ["external", "inline", "inline.nested", "Café", "Choice", "Alias", "LIMIT", "FLAG", "Sender", "Sender.send", "Other", "Other.send", "impl Café.send", "impl Sender for Café.send", "impl Other for Café.send", "résumé", "résumé.nested", "helper"]);
    assert.equal(named.get("Café")?.kind, "type");
    assert.equal(named.get("Sender")?.kind, "trait");
    assert.equal(named.get("LIMIT")?.kind, "constant");
    assert.equal(named.get("FLAG")?.kind, "variable");
    const methods = index.symbols.filter((symbol) => symbol.name === "send");
    assert.equal(methods.length, 5);
    assert.ok(methods.every((symbol) => symbol.kind === "method"));
    assert.equal(new Set(methods.map((symbol) => symbol.id)).size, 5);
    assert.equal(named.get("impl Sender for Café.send")?.parent_id, null);
    assert.equal(named.get("Sender.send")?.parent_id, named.get("Sender")?.id);
    assert.equal(named.get("impl Café.send")?.signature, "fn send(&self)");
    const résumé = named.get("résumé");
    assert.ok(résumé);
    assert.equal(readSymbol(root, résumé.id, index).source.text, source.split("\n").slice(20, 31).join("\n"));
    assert.ok(outlineFile(root, "billing.rs", index).symbols.some((symbol) => symbol.id === résumé.id));
    const retrieval = await hybridRetrieve(root, "needleinside", 10, "lexical", undefined, index);
    assert.ok(retrieval.results.some((result) => result.symbol?.id === résumé.id));
    assert.deepEqual(index.dependencies.map((record) => record.module_specifier), ["crate::helper::{self, send as emit}", "external"]);
    assert.ok(index.dependencies.every((record) => record.target_file === null && record.resolution === "unresolved"));
    assert.ok(index.calls.every((call) => call.callee_symbol_id === null && call.resolution === "unresolved" && call.guard_condition === null));
    assert.equal(index.calls.find((call) => call.range.start.line === 24)?.caller_symbol_id, null);
    assert.equal(index.calls.find((call) => call.range.start.line === 25)?.caller_symbol_id, named.get("résumé.nested")?.id);
    assert.equal(index.calls.find((call) => call.range.start.line === 22)?.caller_symbol_id, résumé.id);
    assert.equal(index.calls.find((call) => call.callee_name === "self.send")?.caller_symbol_id, named.get("impl Sender for Café.send")?.id);
    assert.ok(!index.calls.some((call) => call.callee_name === "println"));
    assert.equal(index.inheritance.length, 0);
    assert.equal(index.tests.length, 0);
    assert.ok(index.references.every((record) => record.target_symbol_id === null && record.resolution === "unresolved"));
    const bytes = Buffer.from(source);
    for (const symbol of named.values())
      assert.equal(bytes.subarray(symbol.selection_range.start.byte, symbol.selection_range.end.byte).toString(), symbol.name);
    for (const call of index.calls.filter((record) => record.file === "billing.rs"))
      assert.equal(bytes.subarray(call.range.start.byte, call.range.end.byte).toString(), call.callee_name);
    for (const reference of index.references.filter((record) => record.file === "billing.rs"))
      assert.equal(bytes.subarray(reference.range.start.byte, reference.range.end.byte).toString(), reference.name);
    for (const dependency of index.dependencies)
      assert.equal(bytes.subarray(dependency.range.start.byte, dependency.range.end.byte).toString(), dependency.module_specifier);
    assert.equal(readFileSync(join(root, "billing.rs"), "utf8"), source);
    assert.deepEqual(indexRepository(root), index);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Rust module impls and repeated declarations retain separate lexical identities", () => {
  const root = mkdtempSync(join(tmpdir(), "rust-scopes-"));
  try {
    mkdirSync(join(root, "tests"));
    writeFileSync(join(root, "tests", "scope.rs"), [
      "mod first { struct Item; impl Item { fn send() {} } }",
      "mod second { struct Item; impl Item { fn send() {} } }",
      "impl<T> Trait<T> for Item<T> where T: Copy { fn send() {} }",
      "impl Item { fn send() {} }",
      "impl Item { fn send() {} }",
      'fn fake_test() { test("title"); describe("suite"); }',
      "",
    ].join("\n"));
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@t", "commit", "-qm", "fixture"], { cwd: root });
    const index = indexRepository(root);
    const methods = index.symbols.filter((symbol) => symbol.name === "send");
    assert.deepEqual(methods.map((symbol) => symbol.qualified_name), ["first.impl Item.send", "second.impl Item.send", "impl<T> Trait<T> for Item<T> where T: Copy.send", "impl Item.send", "impl Item.send#2"]);
    assert.equal(new Set(methods.map((symbol) => symbol.id)).size, 5);
    assert.equal(methods[0].parent_id, index.symbols.find((symbol) => symbol.name === "first")?.id);
    assert.equal(methods[1].parent_id, index.symbols.find((symbol) => symbol.name === "second")?.id);
    assert.equal(index.tests.length, 0);
    assert.equal(index.test_symbols.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
