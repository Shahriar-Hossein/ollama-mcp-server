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

test("PHP selected array entries add bounded string and numeric scalar siblings", () => {
  const source = [
    "<?php", "$config = [", "  'selected' => 'value',", "  2 => 17,", '  "label" => "ready",',
    "  'fourth' => 4.5,", "  'fifth' => 'capped',", "];", "$other = array(",
    "  'first' => 1,", "  2 => 'second',", ");",
  ].join("\n");
  withFile(source, (root) => {
    const shortArray = structuralSupport(root, [{ file: "m.php", line: 3 }]);
    assert.deepEqual(shortArray.map((line) => [line.line, line.quote]), [
      [4, "2 => 17,"], [5, '"label" => "ready",'], [6, "'fourth' => 4.5,"],
    ]);
    assert.ok(shortArray.every((line) => line.reason === "scalar sibling PHP array entry of selected line"));
    const longArray = structuralSupport(root, [{ file: "m.php", line: 10 }]);
    assert.deepEqual(longArray.map((line) => line.line), [11]);
  }, "m.php");
});

test("PHP array sibling context stays within the nearest array and excludes dynamic entries", () => {
  const source = [
    "<?php", "$config = [", "  'outer' => [", "    'selected' => 1,", "    'inner' => 'yes',",
    "    'nested' => [", "      'child' => 2,", "      'sibling' => 3,", "    ],", "    9 => 10,",
    "    ...$extra,", "    dynamic() => 'no',", "    'computed' => $value,", '    "interpolated" => "$runtime",',
    "    'multiline' =>", "      'no',", "  ],", "  'outside' => 'outer',", "];",
  ].join("\n");
  withFile(source, (root) => {
    const lines = structuralSupport(root, [{ file: "m.php", line: 4 }]);
    assert.deepEqual(lines.map((line) => [line.line, line.quote]), [
      [5, "'inner' => 'yes',"], [10, "9 => 10,"],
    ]);
    assert.ok(lines.every((line) => line.line !== 8 && line.line !== 18));
    assert.deepEqual(structuralSupport(root, [{ file: "m.php", line: 7 }]).map((line) => line.line), [8]);
    assert.deepEqual(structuralSupport(root, [{ file: "m.php", line: 16 }]).map((line) => line.line), [4, 5, 10]);
  }, "m.php");
});

test("PHP selected closure header still adds its array sibling context", () => {
  const source = [
    "<?php", "$handlers = [", "  'run' => function () {", "    return true;", "  },",
    "  'label' => 'ready',", "];",
  ].join("\n");
  withFile(source, (root) => {
    const lines = structuralSupport(root, [{ file: "m.php", line: 3 }]);
    assert.deepEqual(lines.map((line) => [line.line, line.quote]), [[6, "'label' => 'ready',"]]);
  }, "m.php");
});

test("PHP array sibling additions deduplicate selected lines and share the global cap", () => {
  const entries = Array.from({ length: 18 }, (_, i) => `  'key${i}' => ${i},`);
  const source = `<?php\n$config = [\n${entries.join("\n")}\n];\n`;
  withFile(source, (root) => {
    const lines = structuralSupport(root, [
      { file: "m.php", line: 3 }, { file: "m.php", line: 3 }, { file: "m.php", line: 4 },
      { file: "m.php", line: 5 }, { file: "m.php", line: 6 },
    ]);
    assert.equal(lines.length, 12);
    assert.equal(new Set(lines.map((line) => `${line.file}:${line.line}`)).size, 12);
    assert.ok(!lines.some((line) => line.line === 3 || line.line === 4));
  }, "m.php");
});

test("Python functions, async methods and nested scopes add their own headers", () => {
  const source = [
    "class Ledger:", "    mode = 'live'", "    async def post(", "        self, items,", "    ):",
    "        if items:", "            return items", "    def factory(self):", "        def nested():",
    "            return 1", "        handler = lambda value: (", "            value + 1", "        )",
    "        return handler", "outside = 1",
  ].join("\n");
  withFile(source, (root) => {
    for (const [selected, header] of [[2, 1], [4, 3], [7, 3], [10, 9], [12, 11], [14, 8]]) {
      const lines = structuralSupport(root, [{ file: "m.py", line: selected }]);
      assert.deepEqual(lines.map((line) => line.line), [header]);
      assert.match(lines[0].reason, /enclosing Python/);
      assert.equal(lines[0].quote, source.split("\n")[header - 1].trim());
    }
    for (const line of [1, 3, 8, 9, 11, 15])
      assert.deepEqual(structuralSupport(root, [{ file: "m.py", line }]), []);
  }, "m.py");
});

test("Python decorated declarations add only bounded single-line decorator context", () => {
  const source = [
    "@first", "@second(option=1)", "@third", "@fourth", "class Service:",
    "    @outer(", "        option=1,", "    )", "    @inner", "    async def run(",
    "        self, value,", "    ):", "        return value",
  ].join("\n");
  withFile(source, (root) => {
    assert.deepEqual(structuralSupport(root, [{ file: "m.py", line: 5 }]).map((line) => line.line), [1, 2, 3]);
    for (const line of [6, 7, 11, 13])
      assert.deepEqual(structuralSupport(root, [{ file: "m.py", line }]).map((item) => item.line), [10, 9]);
    assert.deepEqual(structuralSupport(root, [{ file: "m.py", line: 10 }]).map((line) => line.line), [9]);
    const evidence = [{ file: "m.py", line: 13 }, { file: "m.py", line: 10 }, { file: "m.py", line: 9 }];
    assert.deepEqual(structuralSupport(root, evidence), []);
    assert.deepEqual(evidence.map((line) => line.line), [13, 10, 9]);
  }, "m.py");
});

test("Python malformed scopes and invalid selected lines add nothing", () => {
  withFile("def broken():\n    return @@@\n", (root) => {
    assert.deepEqual(structuralSupport(root, [{ file: "m.py", line: 2 }]), []);
    assert.deepEqual(structuralSupport(root, [{ file: "gone.py", line: 2 }]), []);
  }, "m.py");
  withFile("def valid():\n\n    return 1\n", (root) => {
    for (const line of [0, -1, 1.5, 2, 4, 50, Number.NaN])
      assert.deepEqual(structuralSupport(root, [{ file: "m.py", line }]), []);
    assert.deepEqual(structuralSupport(root, [{ file: "m.py", line: 3 }]).map((line) => line.line), [1]);
  }, "m.py");
  withFile("def outer():\n    def broken(:\n        return 1\n", (root) => {
    assert.deepEqual(structuralSupport(root, [{ file: "m.py", line: 3 }]), []);
  }, "m.py");
});

test("Python dictionary context caps string and numeric keyed scalar siblings", () => {
  const source = [
    "config = {", "    'selected': make_value(),", "    'label': 'ready',", "    2: -3.5,",
    "    'raw': r'path',", "    'extra': +2,", "}",
  ].join("\n");
  withFile(source, (root) => {
    const lines = structuralSupport(root, [{ file: "m.py", line: 2 }]);
    assert.deepEqual(lines.map((line) => line.line), [3, 4, 5]);
    assert.ok(lines.every((line) => line.reason.includes("Python dictionary")));
    assert.ok(lines.every((line) => line.quote === source.split("\n")[line.line - 1].trim()));
    assert.deepEqual(structuralSupport(root, [{ file: "m.py", line: 2 }, { file: "m.py", line: 3 }]).map((line) => line.line), [4, 5, 6]);
  }, "m.py");
});

test("Python dictionary siblings exclude dynamic, unpacked, nested and multiline values", () => {
  const source = [
    "config = {", "    'selected': 1,", "    'format': f'plain',", "    'interpolated': f'{value}',",
    "    f'key': 1,", "    dynamic: 1,", "    'value': dynamic,", "    'bytes': b'abc',",
    "    'nested': {'child': 1},", "    'list': [1],", "    **other,", "    'boolean': True,",
    "    'none': None,", "    'multi': (", "        'line'", "    ),", "    'concat': 'one' 'two',",
    "    'expression': 1 + 2,", "    'signed': -variable,", "    'valid': 'ready',", "}",
  ].join("\n");
  withFile(source, (root) => {
    assert.deepEqual(structuralSupport(root, [{ file: "m.py", line: 2 }]).map((line) => line.line), [20]);
    assert.deepEqual(structuralSupport(root, [{ file: "m.py", line: 11 }]), []);
  }, "m.py");
});

test("Python dictionary context stays within its nearest dictionary", () => {
  const source = [
    "config = {", "    'nested': {", "        'selected': 1,", "        'inner': 'yes',",
    "        **other,", "    },", "    'outer': 'no',", "}",
  ].join("\n");
  withFile(source, (root) => {
    assert.deepEqual(structuralSupport(root, [{ file: "m.py", line: 3 }]).map((line) => line.line), [4]);
    assert.deepEqual(structuralSupport(root, [{ file: "m.py", line: 5 }]), []);
  }, "m.py");
});

test("Python direct imports and aliases add subsequent identifier text context", () => {
  const source = [
    "import package.tools, sys as system", "from .helpers import (", "    read as load,", "    write,", ")",
    "# package system load write", "text = 'package system load write'", 'example = f"{load}"',
    "import load", "load_data()", "rows = load()", "write(rows)", "package.tools.run()", "system.exit()",
  ].join("\n");
  withFile(source, (root) => {
    assert.deepEqual(structuralSupport(root, [{ file: "m.py", line: 1 }]).map((line) => line.line), [13, 14]);
    for (const selected of [2, 3, 4]) {
      const lines = structuralSupport(root, [{ file: "m.py", line: selected }]);
      assert.deepEqual(lines.map((line) => line.line), [11, 12]);
      assert.ok(lines.every((line) => /text context, not binding resolution/.test(line.reason)));
    }
  }, "m.py");
});

test("Python import context excludes wildcard and missing names and caps names", () => {
  const source = [
    "from helper import *", "from helper import unused", "import one, two, three, four",
    "text = 'unused'", "# unused", "one()", "two()", "three()", "four()",
  ].join("\n");
  withFile(source, (root) => {
    for (const line of [1, 2]) assert.deepEqual(structuralSupport(root, [{ file: "m.py", line }]), []);
    assert.deepEqual(structuralSupport(root, [{ file: "m.py", line: 3 }]).map((line) => line.line), [6, 7, 8]);
    assert.deepEqual(structuralSupport(root, [{ file: "m.py", line: 3 }, { file: "m.py", line: 6 }]).map((line) => line.line), [7, 8]);
  }, "m.py");
});

test("Python supporting lines share the global cap and deduplicate repeated evidence", () => {
  const source = Array.from({ length: 20 }, (_, i) => `@decorate\ndef f${i}():\n    return ${i}`).join("\n");
  withFile(source, (root) => {
    const evidence = Array.from({ length: 20 }, (_, i) => ({ file: "m.py", line: i * 3 + 3 }));
    const lines = structuralSupport(root, evidence.concat(evidence));
    assert.equal(lines.length, 12);
    assert.equal(new Set(lines.map((line) => `${line.file}:${line.line}`)).size, lines.length);
  }, "m.py");
  const entries = Array.from({ length: 20 }, (_, i) => `    'key${i}': ${i},`);
  withFile(`config = {\n${entries.join("\n")}\n}`, (root) => {
    const evidence = [3, 4, 5, 6, 7].map((line) => ({ file: "m.py", line }));
    const lines = structuralSupport(root, evidence.concat(evidence));
    assert.equal(lines.length, 12);
    assert.ok(lines.every((line) => !evidence.some((item) => item.line === line.line)));
  }, "m.py");
});
