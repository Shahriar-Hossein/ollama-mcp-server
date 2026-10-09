import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { indexRepository, type SourceRange } from "./indexer.js";
import { readSymbol } from "./read-symbol.js";
import { hybridRetrieve } from "./retrieval.js";
import { SourceOffsets } from "./source-offsets.js";
import { wordpressWooCommerceAdapter } from "../experimental/explorer/wordpress-woocommerce-adapter.js";

const padding = "é😀".repeat(30);
const bodies = {
  "app.php": `function résumé() { $value = '${padding}'; return helper('needleinside'); }`,
  "app.py": `def résumé(self):\n        value = '${padding}'; return helper.run('needleinside')`,
  "app.js": `function résumé() { const value = '${padding}'; return helper('needleinside'); }`,
  "app.ts": `function résumé() { const value = '${padding}'; return helper('needleinside'); }`,
  "app.go": `func Résumé() string { value := "${padding}"; return helper(value + "needleinside") }`,
  "app.rs": `fn résumé() { let value = "${padding}"; helper(value, "needleinside"); }`,
};
const sources = {
  "app.php": `<?php\n// é😀\nrequire './helper.php';\nclass Base {}\nclass Café extends Base {\n    ${bodies["app.php"]}\n}\nfunction helper($value) { return $value; }\n`,
  "app.py": `# é😀\nimport helper\nclass Base:\n    pass\nclass Café(Base):\n    ${bodies["app.py"]}\n`,
  "app.js": `// é😀\nimport { helper } from './helper.js';\nclass Base {}\nclass Café extends Base {}\n/* é😀 */ ${bodies["app.js"]}\n`,
  "app.ts": `// é😀\nimport { helper } from './helper.js';\nclass Base {}\nclass Café extends Base {}\n/* é😀 */ ${bodies["app.ts"]}\n`,
  "app.go": `package example\n// é😀\nimport "example.com/helper"\n${bodies["app.go"]}\n`,
  "app.rs": `// é😀\nuse crate::helper;\n${bodies["app.rs"]}\n`,
  "helper.js": "export function helper(value) { return value; }\nexport function other() {}\n",
  "helper.php": "<?php function spare() {}\n",
  "helper.py": "def run(value):\n    return value\n",
  "app.test.ts":
    "// é😀\nimport { helper, other } from './helper.js';\ntest('é😀', () => { const text = 'é😀'; helper(text); other(); });\n",
  "hooks.ts":
    "// é😀\nexport function install() { const text = 'é😀'; add_action('é😀hook', callback); }\n",
};

function fixture(run: (root: string) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "utf8-ranges-"));
  for (const [file, source] of Object.entries(sources)) writeFileSync(join(root, file), source);
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@t", "commit", "-qm", "fixture"], {
    cwd: root,
  });
  return run(root).finally(() => rmSync(root, { recursive: true, force: true }));
}

function slice(file: string, range: SourceRange): string {
  const bytes = Buffer.from(sources[file as keyof typeof sources]);
  for (const position of [range.start, range.end]) {
    const prefix = bytes.subarray(0, position.byte).toString();
    assert.equal(position.line, prefix.split("\n").length);
    const lineStart = bytes.lastIndexOf(10, position.byte - 1) + 1;
    assert.equal(position.column, position.byte - lineStart + 1);
  }
  return bytes.subarray(range.start.byte, range.end.byte).toString();
}

test("every language exposes UTF-8 ranges for symbol reads and retrieval", () =>
  fixture(async (root) => {
    const index = indexRepository(root);
    for (const [file, body] of Object.entries(bodies)) {
      const symbol = index.symbols.find(
        (symbol) => symbol.file === file && /^(?:résumé|Résumé)$/.test(symbol.name),
      );
      assert.ok(symbol, file);
      assert.equal(slice(file, symbol.selection_range), symbol.name);
      assert.equal(readSymbol(root, symbol.id, index).source.text, body);
      const retrieved = await hybridRetrieve(root, "needleinside", 30, "lexical", undefined, index);
      assert.ok(
        retrieved.results.some((result) => result.symbol?.id === symbol.id),
        file,
      );
    }
    for (const symbol of index.symbols)
      assert.equal(slice(symbol.file, symbol.selection_range), symbol.name);
    assert.ok(index.inheritance.some((edge) => edge.file === "app.php"));
    assert.ok(index.inheritance.some((edge) => edge.file === "app.py"));
    for (const reference of index.references)
      assert.equal(slice(reference.file, reference.range), reference.name);
    for (const call of index.calls) assert.equal(slice(call.file, call.range), call.callee_name);
    for (const dependency of index.dependencies) {
      const text = slice(dependency.file, dependency.range);
      assert.ok(
        text === dependency.module_specifier || text.slice(1, -1) === dependency.module_specifier,
        text,
      );
    }
    for (const edge of index.inheritance)
      assert.equal(slice(edge.file, edge.range), edge.parent_name);
    const discovered = index.tests.find((record) => record.kind === "test");
    assert.ok(discovered);
    assert.equal(
      slice(discovered.file, discovered.range),
      sources["app.test.ts"].split("\n")[2].slice(0, -1),
    );
    const edges = index.test_symbols.filter((edge) => edge.test_name === discovered.name);
    assert.ok(edges.length >= 2);
    assert.ok(
      edges.some(
        (edge) =>
          index.symbols.find((symbol) => symbol.id === edge.target_symbol_id)?.name === "helper",
      ),
    );
    assert.ok(
      edges.some(
        (edge) =>
          index.symbols.find((symbol) => symbol.id === edge.target_symbol_id)?.name === "other",
      ),
    );
    for (const edge of edges) {
      assert.equal(edge.test_range, discovered.range);
      assert.equal(
        slice(edge.test_file, edge.test_range),
        sources["app.test.ts"].split("\n")[2].slice(0, -1),
      );
    }
  }));

test("WordPress facts retain UTF-8 ranges and owners after Unicode", () =>
  fixture(async (root) => {
    const index = indexRepository(root);
    const adapter = wordpressWooCommerceAdapter.extract({ repository_root: root, index });
    const hook = adapter.facts.find((fact) => fact.kind === "hook_registration");
    assert.ok(hook);
    assert.equal(
      index.symbols.find((symbol) => symbol.id === hook.containing_symbol_id)?.name,
      "install",
    );
    assert.equal(slice(hook.file, hook.range), "add_action('é😀hook', callback)");
  }));

test("normalization converts shared positions once and reverses Unicode boundaries", () => {
  const offsets = new SourceOffsets("é😀\nxé😀z");
  const range = { start: { line: 2, column: 2, byte: 5 }, end: { line: 2, column: 5, byte: 8 } };
  offsets.normalizeRanges([range, range, { start: range.start, end: range.end }]);
  assert.deepEqual(range, {
    start: { line: 2, column: 2, byte: 8 },
    end: { line: 2, column: 8, byte: 14 },
  });
  assert.equal(offsets.toIndex(8), 5);
  assert.equal(offsets.toIndex(14), 8);
});
