import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { structuralSupport } from "./local-explore-structure.js";

function withFile(source: string, run: (root: string) => void, file = "m.ts") {
  const root = mkdtempSync(join(tmpdir(), "scout-structure-"));
  try {
    writeFileSync(join(root, file), source);
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

test("PHP functions and nested control flow add the named function header", () => {
  const source = "<?php\nnamespace Billing;\nfunction total($items) {\n  foreach ($items as $item) {\n    record($item);\n  }\n}\nrecord([]);\n";
  withFile(source, (root) => {
    const evidence = [{ file: "m.php", line: 5 }];
    const lines = structuralSupport(root, evidence);
    assert.deepEqual(lines, [{
      file: "m.php", line: 3, quote: "function total($items) {",
      reason: "enclosing PHP function definition of selected line",
    }]);
    assert.deepEqual(evidence, [{ file: "m.php", line: 5 }]);
    assert.deepEqual(structuralSupport(root, [{ file: "m.php", line: 8 }]), []);
  }, "m.php");
});

test("PHP method and class headers exclude attributes and preserve multiline names", () => {
  const source = [
    "<?php", "#[Entity]", "final class Ledger {", "  public const MODE = 'live';",
    "  #[Route('/post')]", "  public function", "  post(", "    $entry", "  ) {",
    "    return $entry;", "  }", "}",
  ].join("\n");
  withFile(source, (root) => {
    const body = structuralSupport(root, [{ file: "m.php", line: 10 }]);
    assert.deepEqual(body.map((line) => [line.line, line.quote]), [[7, "post("]]);
    assert.match(body[0].reason, /method declaration/);
    assert.deepEqual(structuralSupport(root, [{ file: "m.php", line: 4 }]).map((line) => line.line), [3]);
    assert.deepEqual(structuralSupport(root, [{ file: "m.php", line: 5 }]).map((line) => line.line), [7]);
    assert.deepEqual(structuralSupport(root, [{ file: "m.php", line: 2 }]).map((line) => line.line), [3]);
    assert.deepEqual(structuralSupport(root, [{ file: "m.php", line: 7 }]), []);
    const selected = [{ file: "m.php", line: 10 }, { file: "m.php", line: 7 }];
    assert.deepEqual(structuralSupport(root, selected), []);
  }, "m.php");
});

test("PHP nested functions and anonymous scopes never acquire an outer method header", () => {
  const source = [
    "<?php", "class Factory {", "  public function build() {",
    "    function helper() {", "      return 1;", "    }",
    "    $callback = static function ($x) {", "      return $x;", "    };",
    "    $arrow = fn($x) =>", "      $x + 1;",
    "    $object = new class {", "      public $value = 3;",
    "      public function read() {", "        return $this->value;", "      }", "    };",
    "    return $callback;", "  }", "}",
  ].join("\n");
  withFile(source, (root) => {
    for (const [selected, expected, type] of [
      [5, 4, "function definition"], [8, 7, "anonymous function"],
      [11, 10, "arrow function"], [13, 12, "anonymous class"],
      [15, 14, "method declaration"], [18, 3, "method declaration"],
    ] as const) {
      const lines = structuralSupport(root, [{ file: "m.php", line: selected }]);
      assert.deepEqual(lines.map((line) => line.line), [expected]);
      assert.equal(lines[0].quote, source.split("\n")[expected - 1].trim());
      assert.ok(lines[0].reason.includes(type));
    }
    for (const line of [3, 4, 7, 10, 12, 14]) {
      assert.deepEqual(structuralSupport(root, [{ file: "m.php", line }]), []);
    }
  }, "m.php");
});

test("PHP trait, interface and enum members add their nearest declaration", () => {
  for (const header of ["trait Shared", "interface Service", "enum State: string"]) {
    const member = header.startsWith("interface")
      ? "  public function run(): void;"
      : header.startsWith("enum") ? "  case Ready = 'ready';" : "  public $value = 1;";
    withFile(`<?php\n${header} {\n${member}\n}\n`, (root) => {
      const lines = structuralSupport(root, [{ file: "m.php", line: 3 }]);
      // An interface method is itself the nearest scope, already selected.
      assert.deepEqual(lines.map((line) => line.line), header.startsWith("interface") ? [] : [2]);
    }, "m.php");
  }
  withFile("<?php\ninterface Service {\n  public const VERSION = 1;\n}\n", (root) => {
    assert.deepEqual(structuralSupport(root, [{ file: "m.php", line: 3 }]).map((line) => line.line), [2]);
  }, "m.php");
});

test("PHP malformed scopes, missing files and invalid selections add nothing", () => {
  withFile("<?php\nfunction broken() {\n  return @@@;\n}\n", (root) => {
    assert.deepEqual(structuralSupport(root, [{ file: "m.php", line: 3 }]), []);
    assert.deepEqual(structuralSupport(root, [{ file: "gone.php", line: 3 }]), []);
  }, "m.php");
  withFile("<?php\nfunction valid() {\n\n  return 1;\n}\n", (root) => {
    for (const line of [-1, 0, 1.5, 3, 7, NaN, Infinity]) {
      assert.deepEqual(structuralSupport(root, [{ file: "m.php", line }]), []);
    }
    assert.deepEqual(structuralSupport(root, [{ file: "m.php", line: 4 }]).map((line) => line.line), [2]);
  }, "m.php");
});

test("PHP declaration support shares the entry cap and deduplicates headers", () => {
  const source = "<?php\n" + Array.from({ length: 20 }, (_, i) => `function f${i}() {\n  return ${i};\n}`).join("\n");
  withFile(source, (root) => {
    const picks = Array.from({ length: 20 }, (_, i) => ({ file: "m.php", line: i * 3 + 3 }));
    assert.equal(structuralSupport(root, picks).length, 12);
    assert.equal(structuralSupport(root, [picks[0], picks[0]]).length, 1);
  }, "m.php");
});
