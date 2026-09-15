#!/usr/bin/env node
// Isolated T1/G1 benchmark runner. This is intentionally separate from the
// MCP server's autonomous tools: it exposes fixture-scoped structured tools,
// never a shell, and creates a new disposable Git repository per attempt.
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const FIXTURE_VERSION = "2026-09-15-public-1";
const DEFAULT_MODEL = "qwen3.5:4b";
const MAX_TURNS = 6;
const MAX_TOOL_OUTPUT = 12_000;

const FIXTURES = {
  T1: {
    prompt: "Find the declared default timeout, run the focused test that covers it, then report the observed result. Do not edit.",
    files: {
      "src/runtime.js": "export const defaultTimeoutMs = 65000;\n",
      "test/runtime.test.js": `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { defaultTimeoutMs } from "../src/runtime.js";\ntest("declares the default worker timeout", () => assert.equal(defaultTimeoutMs, 65000));\n`,
      "docs/UNRELATED.md": "This sentinel must not change.\n",
      "package.json": "{\"type\":\"module\"}\n",
    },
    testArgs: ["--test", "test/runtime.test.js"],
    writablePaths: [],
  },
  G1: {
    prompt: "In this disposable repository, make parsePort reject values above 65535. Change only src/parse-port.js; run the stated test. Briefly report the observed test result.",
    files: {
      "src/parse-port.js": `export function parsePort(value) {\n  const port = Number(value);\n  if (!Number.isInteger(port) || port < 1) throw new RangeError("port must be a positive integer");\n  return port;\n}\n`,
      "test/parse-port.test.js": `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { parsePort } from "../src/parse-port.js";\ntest("accepts valid TCP ports", () => assert.equal(parsePort("65535"), 65535));\ntest("rejects ports above the TCP range", () => assert.throws(() => parsePort("65536"), RangeError));\n`,
      "docs/UNRELATED.md": "This sentinel must not change.\n",
      "package.json": "{\"type\":\"module\"}\n",
    },
    testArgs: ["--test", "test/parse-port.test.js"],
    writablePaths: ["src/parse-port.js"],
  },
};

function sha256(contents) { return crypto.createHash("sha256").update(contents).digest("hex"); }
function clipped(value) {
  const text = String(value || "");
  return text.length <= MAX_TOOL_OUTPUT ? text : `${text.slice(0, MAX_TOOL_OUTPUT)}\n[truncated]`;
}
function run(argv, cwd) {
  const result = spawnSync(argv[0], argv.slice(1), { cwd, encoding: "utf8", timeout: 30_000 });
  return { argv, exit_code: result.status, signal: result.signal, error: result.error?.message, stdout: clipped(result.stdout), stderr: clipped(result.stderr) };
}
function artifactPath(name, model) {
  return path.resolve(process.cwd(), `benchmark-data/capability-matrix-${FIXTURE_VERSION}/${name}-${model.replace(/[^a-z0-9]+/gi, "-")}-results.json`);
}
function createDebugLogger(enabled, output) {
  if (!enabled) return () => {};
  const logPath = `${output}.debug.log`;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, "");
  return (event, details = {}) => {
    const entry = { at: new Date().toISOString(), event, ...details };
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
    console.error(`[debug] ${event}${Object.keys(details).length ? ` ${JSON.stringify(details)}` : ""}`);
  };
}
function checked(relativePath) {
  if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath)) return null;
  const normalized = path.posix.normalize(relativePath);
  return normalized === ".." || normalized.startsWith("../") ? null : normalized;
}
function snapshot(root, fixture) {
  const sentinels = {};
  for (const [name, content] of Object.entries(fixture.files)) sentinels[name] = sha256(fs.readFileSync(path.join(root, name)));
  const status = run(["git", "status", "--porcelain=v1"], root);
  const head = run(["git", "rev-parse", "HEAD"], root);
  const diff = run(["git", "diff", "--no-ext-diff", "--"], root);
  return { head: head.stdout.trim(), clean: !status.stdout.trim(), file_hashes: sentinels, git_status: status.stdout.trim(), git_diff: diff.stdout };
}
function createRepository(fixture) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ollama-track-b-"));
  for (const [name, content] of Object.entries(fixture.files)) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  for (const argv of [["git", "init", "-q"], ["git", "config", "user.email", "benchmark@example.invalid"], ["git", "config", "user.name", "Track B Benchmark"], ["git", "add", "."], ["git", "commit", "-qm", "fixture baseline"]]) {
    const result = run(argv, root);
    if (result.exit_code !== 0) throw new Error(`fixture setup failed: ${argv.join(" ")}: ${result.stderr}`);
  }
  return root;
}
function toolDefinitions(fixture) {
  const tools = [
    { type: "function", function: { name: "search", description: "Search text in fixture files. Use this to locate declarations or tests.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
    { type: "function", function: { name: "read_file", description: "Read one UTF-8 file in the fixture repository.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
    { type: "function", function: { name: "run_focused_test", description: "Run the fixture's fixed focused test. It takes no arguments.", parameters: { type: "object", properties: {} } } },
  ];
  if (fixture.writablePaths.length) tools.push({ type: "function", function: { name: "write_file", description: `Replace the contents of the only editable file: ${fixture.writablePaths[0]}.`, parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } });
  return tools;
}
function makeToolRunner(root, fixture, calls) {
  function record(name, args, result) { calls.push({ at: new Date().toISOString(), name, arguments: args, ...result }); return result.output; }
  return (name, args = {}) => {
    if (name === "search") {
      if (typeof args.query !== "string" || !args.query) return record(name, args, { ok: false, output: "Invalid query." });
      const matches = [];
      for (const file of Object.keys(fixture.files)) for (const [index, line] of fs.readFileSync(path.join(root, file), "utf8").split("\n").entries()) {
        if (line.includes(args.query)) matches.push(`${file}:${index + 1}:${line}`);
      }
      return record(name, args, { ok: true, output: matches.length ? matches.join("\n") : "No matches." });
    }
    if (name === "read_file") {
      const file = checked(args.path);
      if (!file || !Object.hasOwn(fixture.files, file)) return record(name, args, { ok: false, output: "Refused: path is outside this fixture." });
      return record(name, args, { ok: true, output: clipped(fs.readFileSync(path.join(root, file), "utf8")) });
    }
    if (name === "run_focused_test") {
      const result = run([process.execPath, ...fixture.testArgs], root);
      return record(name, args, { ok: result.exit_code === 0, test: result, output: `${result.stdout}${result.stderr}`.trim() || "(no output)" });
    }
    if (name === "write_file") {
      const file = checked(args.path);
      if (!file || !fixture.writablePaths.includes(file) || typeof args.content !== "string") return record(name, args, { ok: false, output: "Refused: only the declared editable fixture path may be written." });
      fs.writeFileSync(path.join(root, file), args.content);
      return record(name, args, { ok: true, output: `Wrote ${file}.` });
    }
    return record(name, args, { ok: false, output: "Refused: unknown tool." });
  };
}
function callArguments(call) { return call?.function?.arguments && typeof call.function.arguments === "object" ? call.function.arguments : {}; }
function grade(fixtureId, calls, pre, post, finalResponse) {
  const names = calls.map((call) => call.name);
  const invalid = calls.filter((call) => !call.ok).length;
  const tests = calls.filter((call) => call.name === "run_focused_test");
  const lastTest = tests.at(-1)?.test;
  const changed = Object.entries(post.file_hashes).filter(([file, hash]) => pre.file_hashes[file] !== hash).map(([file]) => file);
  const notes = [];
  if (invalid) notes.push(`${invalid} invalid/refused tool call(s)`);
  if (!tests.length) notes.push("focused test was not run");
  if (lastTest?.exit_code !== 0) notes.push("last focused test did not pass");
  if (!post.head || post.head !== pre.head) notes.push("fixture HEAD changed");
  if (fixtureId === "T1") {
    if (!names.includes("search") || !names.includes("read_file")) notes.push("did not perform both search and read");
    if (changed.length) notes.push(`read-only fixture changed: ${changed.join(", ")}`);
  } else {
    if (!names.includes("write_file")) notes.push("allowed file was not edited through the tool");
    if (changed.length !== 1 || changed[0] !== "src/parse-port.js") notes.push(`wrong changed paths: ${changed.join(", ") || "none"}`);
  }
  if (!/\b(pass|passed|success)\b/i.test(finalResponse || "")) notes.push("final report does not state the observed passing test result");
  return { result: notes.length ? "FAIL" : "PASS", changed_paths: changed, tool_call_count: calls.length, invalid_tool_calls: invalid, notes };
}
async function attempt(fixtureId, model, keepFixture, debug) {
  const fixture = FIXTURES[fixtureId];
  const root = createRepository(fixture);
  const pre = snapshot(root, fixture);
  debug("fixture_created_and_baseline_verified", { fixture: fixtureId, root, head: pre.head, clean: pre.clean });
  const calls = [];
  const messages = [{ role: "system", content: "You are a benchmark coding agent. Use only the supplied tools. Work only on the stated task. Do not claim an observation you did not receive from a tool. When done, give a concise plain-text report." }, { role: "user", content: fixture.prompt }];
  const turns = [];
  let finalResponse = "";
  let error;
  try {
    const invoke = makeToolRunner(root, fixture, calls);
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const started = Date.now();
      debug("chat_request_started", { turn: turn + 1, endpoint: "/api/chat" });
      const response = await fetch("http://127.0.0.1:11434/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, stream: false, think: false, messages, tools: toolDefinitions(fixture), options: { temperature: 0, seed: 42, num_ctx: 16384, num_predict: 1024 }, keep_alive: 0 }) });
      debug("chat_response_status", { turn: turn + 1, status: response.status, ok: response.ok, wall_time_ms: Date.now() - started });
      const body = await response.text();
      let data;
      try { data = JSON.parse(body); } catch { throw new Error(`HTTP ${response.status}: response was not JSON: ${clipped(body)}`); }
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      const message = data.message || {};
      turns.push({ turn: turn + 1, wall_time_ms: Date.now() - started, done_reason: data.done_reason, total_duration_ns: data.total_duration, message: { content: message.content || "", tool_calls: message.tool_calls || [] } });
      messages.push(message);
      if (!message.tool_calls?.length) { finalResponse = message.content || ""; break; }
      for (const call of message.tool_calls) {
        const name = call.function?.name;
        const args = callArguments(call);
        debug("parsed_tool_call", { turn: turn + 1, name, arguments: args, id: call.id });
        messages.push({ role: "tool", content: invoke(name, args), tool_call_id: call.id });
      }
    }
    if (!finalResponse) error = `gave up after ${MAX_TURNS} turn(s) without a final answer`;
  } catch (caught) { error = caught.message; }
  const post = snapshot(root, fixture);
  const result = error ? { result: "ERROR", notes: [error] } : grade(fixtureId, calls, pre, post, finalResponse);
  const artifact = { fixture: `${fixtureId} v${FIXTURE_VERSION}`, model, config: { think: false, temperature: 0, seed: 42, num_ctx: 16384, num_predict: 1024, max_turns: MAX_TURNS }, prompt: fixture.prompt, repository: { retained_path: keepFixture ? root : undefined, pre, post }, tool_calls: calls, turns, final_response: finalResponse, grade: result };
  if (!keepFixture) fs.rmSync(root, { recursive: true, force: true });
  return artifact;
}
async function probe(model, debug) {
  const fixtureId = "T1", fixture = FIXTURES[fixtureId];
  const root = createRepository(fixture);
  const pre = snapshot(root, fixture);
  debug("fixture_created_and_baseline_verified", { fixture: "probe", root, head: pre.head, clean: pre.clean });
  const messages = [
    { role: "system", content: "You are a benchmark coding agent. Use only the supplied tools." },
    { role: "user", content: "Call read_file once for src/runtime.js. Do not answer until after the tool result." },
  ];
  let responseStatus, rawResponse, error;
  try {
    const started = Date.now();
    debug("chat_request_started", { turn: 1, endpoint: "/api/chat" });
    const response = await fetch("http://127.0.0.1:11434/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, stream: false, think: false, messages, tools: toolDefinitions(fixture), options: { temperature: 0, seed: 42, num_ctx: 16384, num_predict: 1024 }, keep_alive: 0 }) });
    responseStatus = { status: response.status, ok: response.ok, wall_time_ms: Date.now() - started };
    debug("chat_response_status", { turn: 1, ...responseStatus });
    const body = await response.text();
    try { rawResponse = JSON.parse(body); } catch { rawResponse = { non_json_body: clipped(body) }; }
    if (!response.ok || rawResponse.error) throw new Error(rawResponse.error || `HTTP ${response.status}`);
    for (const call of rawResponse.message?.tool_calls || []) debug("parsed_tool_call", { turn: 1, name: call.function?.name, arguments: callArguments(call), id: call.id });
  } catch (caught) { error = caught.message; }
  const post = snapshot(root, fixture);
  fs.rmSync(root, { recursive: true, force: true });
  return { fixture: `tool-call-probe using ${fixtureId} v${FIXTURE_VERSION}`, model, config: { think: false, temperature: 0, seed: 42, num_ctx: 16384, num_predict: 1024, max_turns: 1 }, repository: { pre, post }, response_status: responseStatus, raw_response: rawResponse, error };
}
async function selfTest() {
  for (const fixtureId of Object.keys(FIXTURES)) {
    const fixture = FIXTURES[fixtureId], root = createRepository(fixture), calls = [], pre = snapshot(root, fixture), invoke = makeToolRunner(root, fixture, calls);
    invoke("read_file", { path: "../outside" });
    invoke("run_focused_test", {});
    if (fixtureId === "G1") { invoke("write_file", { path: "docs/UNRELATED.md", content: "bad" }); invoke("write_file", { path: "src/parse-port.js", content: fixture.files["src/parse-port.js"].replace("port < 1", "port < 1 || port > 65535") }); invoke("run_focused_test", {}); }
    const post = snapshot(root, fixture);
    if (!calls.some((call) => !call.ok) || (fixtureId === "G1" && (pre.file_hashes["docs/UNRELATED.md"] !== post.file_hashes["docs/UNRELATED.md"] || post.file_hashes["src/parse-port.js"] === pre.file_hashes["src/parse-port.js"]))) throw new Error(`self-test failed for ${fixtureId}`);
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log("Track-B harness self-test passed.");
}
async function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const debugEnabled = process.argv.includes("--debug");
  const modelIndex = process.argv.indexOf("--model");
  const model = modelIndex >= 0 ? process.argv[modelIndex + 1] : DEFAULT_MODEL;
  if (!model) throw new Error("--model requires a tag");
  if (process.argv.includes("--probe")) {
    const output = artifactPath("tool-call-probe", model);
    const debug = createDebugLogger(debugEnabled, output);
    debug("artifact_write_path", { output });
    const artifact = await probe(model, debug);
    fs.writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);
    debug("artifact_written", { output });
    console.log(`tool-call probe ${model}: ${artifact.error ? "ERROR" : "OK"} (${output})`);
    return;
  }
  const fixtureId = (process.argv[process.argv.indexOf("--fixture") + 1] || "").toUpperCase();
  if (!FIXTURES[fixtureId]) throw new Error("Usage: run-capability-matrix-track-b.cjs --fixture T1|G1 [--model tag] [--keep-fixture] [--debug], or --probe [--model tag] [--debug]");
  const output = artifactPath(fixtureId.toLowerCase(), model);
  const debug = createDebugLogger(debugEnabled, output);
  debug("artifact_write_path", { output });
  const artifact = await attempt(fixtureId, model, process.argv.includes("--keep-fixture"), debug);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);
  debug("artifact_written", { output });
  console.log(`${fixtureId} ${model}: ${artifact.grade.result} (${output})`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
