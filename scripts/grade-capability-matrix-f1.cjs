#!/usr/bin/env node
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const resultPath = path.resolve(process.cwd(), "benchmark-data/capability-matrix-2026-09-15/f1-local-results.json");
const runnerPath = path.join(os.tmpdir(), "capability-matrix-f1-sandbox-runner.cjs");
const harness = String.raw`const rows = [
  { kind: "10", id: 1 }, { kind: "__proto__", id: 2 },
  { kind: "2", id: 3 }, { kind: "10", id: 4 },
  { kind: "alpha", id: 5 }, { kind: "__proto__", id: 6 },
];
const before = JSON.stringify(rows);
if (typeof groupBy !== "function") throw new Error("groupBy was not declared");
const groups = groupBy(rows);
if (Object.prototype.toString.call(groups) !== "[object Map]") throw new Error("did not return a Map");
const keys = [...groups.keys()];
if (JSON.stringify(keys) !== JSON.stringify(["10", "__proto__", "2", "alpha"])) throw new Error("wrong key order: " + JSON.stringify(keys));
for (const [key, expectedIds] of [["10", [1, 4]], ["__proto__", [2, 6]], ["2", [3]], ["alpha", [5]]]) {
  const actual = groups.get(key);
  if (!Array.isArray(actual) || JSON.stringify(actual.map((row) => row.id)) !== JSON.stringify(expectedIds)) throw new Error("wrong group for " + key);
}
if (JSON.stringify(rows) !== before) throw new Error("mutated input rows");
let threw = false;
try { groupBy({}); } catch (error) { threw = error && error.name === "TypeError"; }
if (!threw) throw new Error("does not throw TypeError for non-array input");`;
const runner = `const vm = require("node:vm");
const source = require("node:fs").readFileSync(0, "utf8");
const outcome = { format: !new RegExp("\`\`\`|<think>|<thought>|\\\\b(import|export)\\\\b").test(source), behavior: false, notes: [] };
try {
  const sandbox = {};
  vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  new vm.Script(source, { timeout: 1000 }).runInContext(sandbox, { timeout: 1000 });
  new vm.Script(${JSON.stringify(harness)}, { timeout: 1000 }).runInContext(sandbox, { timeout: 1000 });
  outcome.behavior = true;
} catch (error) { outcome.notes.push(error.message); }
outcome.result = outcome.format && outcome.behavior ? "PASS" : "FAIL";
process.stdout.write(JSON.stringify(outcome));
`;
fs.writeFileSync(runnerPath, runner, { mode: 0o600 });

const data = JSON.parse(fs.readFileSync(resultPath, "utf8"));
for (const attempt of data.attempts) {
  if (!attempt.response) continue;
  const run = childProcess.spawnSync("bwrap", [
    "--unshare-all", "--die-with-parent", "--new-session", "--clearenv",
    "--ro-bind", "/usr", "/usr", "--ro-bind", "/lib", "/lib",
    "--ro-bind", "/lib64", "/lib64", "--proc", "/proc", "--dev", "/dev",
    "--tmpfs", "/tmp", "--ro-bind", runnerPath, "/grader.cjs",
    "/usr/bin/node", "/grader.cjs",
  ], { input: attempt.response, encoding: "utf8", timeout: 3000, maxBuffer: 16 * 1024 });
  if (run.error || run.status !== 0) {
    attempt.grade = { result: "ERROR", format: false, behavior: false, notes: [run.error?.message || run.stderr.trim() || `sandbox exited ${run.status}`] };
  } else {
    attempt.grade = JSON.parse(run.stdout);
  }
  console.log(`${attempt.model}: ${attempt.grade.result}`);
}
fs.writeFileSync(resultPath, `${JSON.stringify(data, null, 2)}\n`);
