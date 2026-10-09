import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { structuralSupport } from "./local-explore-structure.js";

function withFile(source: string, run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "scout-structure-"));
  try {
    writeFileSync(join(root, "m.ts"), source);
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const nest = [
  "import { Module } from '@nestjs/common';",
  "",
  "@Module({",
  "  controllers: [BillingController],",
  "  providers: [",
  "    InvoiceService,",
  "    LedgerService,",
  "    { provide: TOKEN, useClass: Guard },",
  "  ],",
  "})",
  "export class BillingModule {}",
].join("\n");

test("selected provider object adds class, key and direct siblings", () => {
  withFile(nest, (root) => {
    const lines = structuralSupport(root, [{ file: "m.ts", line: 8 }]);
    assert.deepEqual(
      lines.map((l) => l.line).sort((a, b) => a - b),
      [5, 6, 7, 11],
    );
    assert.ok(lines.every((l) => l.reason));
  });
});

test("selected line outside arrays adds only the class; selected lines are not duplicated", () => {
  withFile(nest, (root) => {
    assert.deepEqual(structuralSupport(root, [{ file: "m.ts", line: 4 }]).map((l) => l.line), [11]);
    const lines = structuralSupport(root, [{ file: "m.ts", line: 6 }, { file: "m.ts", line: 11 }]);
    assert.deepEqual(lines.map((l) => l.line).sort((a, b) => a - b), [5, 7]);
  });
});

test("aliased Module import on a non-exported class works", () => {
  withFile(
    "import { Module as M } from '@nestjs/common';\n@M({\n  exports: [Cache],\n})\nclass CacheModule {}\n",
    (root) => {
      const lines = structuralSupport(root, [{ file: "m.ts", line: 3 }]);
      assert.deepEqual(lines.map((l) => l.line), [5]);
    },
  );
});

test("non-Nest object with providers key adds nothing", () => {
  withFile(
    "const config = {\n  providers: [\n    One,\n  ],\n};\nexport class Holder {}\n",
    (root) =>
      assert.deepEqual(structuralSupport(root, [{ file: "m.ts", line: 3 }]).map((l) => l.line), [1]),
  );
  withFile(
    "import { Module } from './mine.js';\n@Module({\n  providers: [One],\n})\nexport class X {}\n",
    (root) => assert.deepEqual(structuralSupport(root, [{ file: "m.ts", line: 3 }]), []),
  );
});

test("ambiguous metadata stays unresolved", () => {
  withFile(
    "import { Module } from '@nestjs/common';\n@Module({\n  providers: [One],\n  ...extra,\n})\nexport class X {}\n",
    (root) => assert.deepEqual(structuralSupport(root, [{ file: "m.ts", line: 3 }]), []),
  );
  withFile(
    "import { Module } from '@nestjs/common';\nfunction wrap() {\n  return { providers: [One] };\n}\n@Module({\n  providers: [Two],\n})\nexport class X {}\n",
    (root) =>
      assert.deepEqual(structuralSupport(root, [{ file: "m.ts", line: 3 }]).map((l) => l.line), [2]),
  );
});

const payments = [
  "export const gateways = {",
  "  stripe: {",
  '    label: "Card",',
  "    fee: 2.9,",
  "    retries: 3,",
  '    region: "eu",',
  '    mode: "live",',
  "    hooks: [onPay],",
  "  },",
  "};",
].join("\n");

test("selected object value adds declaration and capped scalar siblings", () => {
  withFile(payments, (root) => {
    const lines = structuralSupport(root, [{ file: "m.ts", line: 4 }]);
    assert.deepEqual(lines.map((l) => l.line), [1, 3, 5, 6]);
    assert.ok(lines.every((l) => l.reason));
  });
});

test("already selected lines are not repeated", () => {
  withFile(payments, (root) => {
    const lines = structuralSupport(root, [
      { file: "m.ts", line: 4 },
      { file: "m.ts", line: 1 },
      { file: "m.ts", line: 3 },
    ]);
    assert.deepEqual(lines.map((l) => l.line), [5, 6, 7]);
  });
});

test("nested function in an object adds the nearest declaration header", () => {
  withFile(
    "export function buildInvoice(items) {\n  const totals = {\n    net(x) {\n      return x * 2;\n    },\n  };\n  return totals;\n}\n",
    (root) => {
      const lines = structuralSupport(root, [{ file: "m.ts", line: 4 }]);
      assert.deepEqual(lines.map((l) => l.line), [3]);
      assert.match(lines[0].reason, /method definition/);
    },
  );
  withFile("class Ledger {\n  post(a) {\n    return a;\n  }\n}\n", (root) =>
    assert.deepEqual(structuralSupport(root, [{ file: "m.ts", line: 3 }]).map((l) => l.line), [2]),
  );
});

test("top-level statement adds nothing", () => {
  withFile("registerHandler(invoice);\nstart();\n", (root) =>
    assert.deepEqual(structuralSupport(root, [{ file: "m.ts", line: 2 }]), []),
  );
});

test("total supporting entries are capped", () => {
  const source = Array.from({ length: 20 }, (_, i) => `function f${i}() {\n  return ${i};\n}`).join("\n");
  withFile(source, (root) => {
    const picks = Array.from({ length: 20 }, (_, i) => ({ file: "m.ts", line: i * 3 + 2 }));
    assert.equal(structuralSupport(root, picks).length, 12);
  });
});

test("unparseable or missing files add nothing", () => {
  withFile("}}} ((( @@@ \u0000 ;;;", (root) => {
    assert.doesNotThrow(() => structuralSupport(root, [{ file: "m.ts", line: 1 }]));
    assert.deepEqual(structuralSupport(root, [{ file: "gone.ts", line: 1 }]), []);
  });
});

test("selected import adds the first use of each imported name", () => {
  const source = [
    "import Ledger from './ledger';",
    "import { rates as taxRates, unused } from './rates';",
    "",
    "export function Summary() {",
    "  const rows = taxRates.filter(Boolean);",
    "  return <Ledger rows={rows} />;",
    "}",
  ].join("\n");
  const root = mkdtempSync(join(tmpdir(), "scout-structure-"));
  try {
    writeFileSync(join(root, "s.tsx"), source);
    const named = structuralSupport(root, [{ file: "s.tsx", line: 2 }]);
    assert.deepEqual(named.map((l) => [l.line, l.reason]), [[5, "first use of imported 'taxRates'"]]);
    const fallback = structuralSupport(root, [{ file: "s.tsx", line: 1 }]);
    assert.deepEqual(fallback.map((l) => l.line), [6]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
