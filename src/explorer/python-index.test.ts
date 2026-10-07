import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { indexRepository } from "./indexer.js";

test("indexes Python symbols, imports, calls and inheritance", () => {
  const root = mkdtempSync(join(tmpdir(), "py-index-"));
  try {
    mkdirSync(join(root, "pkg"));
    writeFileSync(join(root, "pkg/__init__.py"), "");
    writeFileSync(
      join(root, "pkg/base.py"),
      "class Base:\n    def run(self):\n        return helper()\n\ndef helper():\n    return 1\n",
    );
    writeFileSync(
      join(root, "pkg/app.py"),
      "import os\nfrom .base import Base, helper as h\n\nclass App(Base):\n    def __init__(self):\n        h()\n\n    @staticmethod\n    def go():\n        os.getcwd()\n",
    );
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "x"], {
      cwd: root,
    });
    const index = indexRepository(root) as any;
    const kinds = Object.fromEntries(index.symbols.map((s: any) => [s.qualified_name, s.kind]));
    assert.equal(kinds["App"], "class");
    assert.equal(kinds["App.__init__"], "constructor");
    assert.equal(kinds["App.go"], "method");
    assert.equal(kinds["helper"], "function");
    const dep = index.dependencies.find((d: any) => d.module_specifier === ".base");
    assert.equal(dep.target_file, "pkg/base.py");
    assert.equal(index.inheritance.find((i: any) => i.parent_name === "Base").resolution, "static");
    const h = index.calls.find((c: any) => c.callee_name === "h");
    assert.ok(h.callee_symbol_id, "aliased import call should resolve");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
