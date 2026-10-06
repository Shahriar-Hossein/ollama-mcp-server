import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import axios from "axios";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { checkInputBudget, checkGenerationInputBudget, clearModelSettingsCache, generateWithModelBudget, resolveModelBudget } from "./ollama-client.js";
import { registerRunOllamaTask } from "./tools/run-ollama-task.js";
import { registerSummarizeOutput } from "./tools/summarize-output.js";
import { runLocalExplorerTask } from "./experimental/tools/local-explorer-task.js";

const settings = (model: string) => ({ parameters: `num_ctx ${model.includes(":h-q4_0-24k") ? 24576 : model.includes(":i-") ? 32768 : 50000}\nnum_predict ${model.includes(":i-") ? 25000 : 16000}`, template: "{{ .System }}{{ .Prompt }}" });
beforeEach(() => clearModelSettingsCache());

test("shares concurrent settings requests per tag without caching budget overrides", async (t) => {
  const requests: string[] = [];
  t.mock.method(axios, "post", async (_url: string, body: { model: string }) => {
    requests.push(body.model);
    return { data: settings(body.model) };
  });
  const [saved, overridden] = await Promise.all([
    resolveModelBudget("qwen-context:h-q4_0-50k"),
    resolveModelBudget("qwen-context:h-q4_0-50k", { num_predict: 4096 }),
  ]);
  assert.equal(saved.num_predict, 16000);
  assert.equal(overridden.num_predict, 4096);
  await resolveModelBudget("qwen-context:i-q8_0-32k");
  assert.deepEqual(requests, ["qwen-context:h-q4_0-50k", "qwen-context:i-q8_0-32k"]);
  clearModelSettingsCache("qwen-context:h-q4_0-50k");
  await resolveModelBudget("qwen-context:h-q4_0-50k");
  assert.equal(requests.length, 3);
});

test("refreshes saved settings after 60 seconds", async (t) => {
  let now = 1000;
  let calls = 0;
  t.mock.method(Date, "now", () => now);
  t.mock.method(axios, "post", async () => ({
    data: { parameters: `num_ctx ${++calls === 1 ? 50000 : 32768}\nnum_predict 25000` },
  }));
  assert.equal((await resolveModelBudget("fixture")).num_ctx, 50000);
  now += 59_999;
  assert.equal((await resolveModelBudget("fixture")).num_ctx, 50000);
  now++;
  assert.equal((await resolveModelBudget("fixture")).num_ctx, 32768);
  assert.equal(calls, 2);
});

test("does not cache failed settings requests", async (t) => {
  let calls = 0;
  t.mock.method(axios, "post", async () => {
    if (++calls === 1) throw new Error("unavailable");
    return { data: settings("H") };
  });
  await assert.rejects(resolveModelBudget("fixture"), /unavailable/);
  assert.equal((await resolveModelBudget("fixture")).num_ctx, 50000);
  assert.equal(calls, 2);
});

test("inherits H/I settings and reserves their full output ceiling", async () => {
  for (const [model, input_budget] of [["qwen-context:h-q4_0-24k", 7552], ["qwen-context:h-q4_0-50k", 32976], ["qwen-context:i-q8_0-32k", 6744]] as const) {
    const budget = await resolveModelBudget(model, {}, async () => settings(model));
    assert.equal(budget.input_budget, input_budget);
    assert.equal(budget.num_predict, model.includes(":i-") ? 25000 : 16000);
    assert.deepEqual(budget.sources, { num_ctx: "model", num_predict: "model" });
  }
});

test("explicitly smaller output reserve makes room for input without changing model defaults", async () => {
  const budget = await resolveModelBudget("I", { num_predict: 4096 }, async () => ({ parameters: "num_ctx 32768\nnum_predict 25000" }));
  assert.equal(budget.input_budget, 27648);
  assert.equal(budget.sources.num_predict, "request");
});

test("accounts for template and Unicode bytes at the overflow boundary", async () => {
  const budget = await resolveModelBudget("fixture", {}, async () => ({ parameters: "num_ctx 1031\nnum_predict 1", template: "X" }));
  assert.equal(checkInputBudget(budget, "éé").fits, true);
  assert.equal(checkInputBudget(budget, "ééé").fits, false);
});

test("rejects unbounded defaults, infeasible reserves and invalid overrides", async () => {
  await assert.rejects(resolveModelBudget("fixture", {}, async () => ({ parameters: "num_ctx 32768\nnum_predict -1" })), /finite positive/);
  await assert.rejects(resolveModelBudget("fixture", { num_ctx: 16000 }, async () => settings("H")), /no input budget/);
  await assert.rejects(resolveModelBudget("fixture", { num_predict: 1.5 }, async () => settings("H")), /finite positive/);
});

test("basic MCP tools apply bounded tool reserves and preserve explicit overrides", async (t) => {
  const requests: Array<Record<string, any>> = [];
  t.mock.method(axios, "post", async (url: string, body: Record<string, any>) => {
    if (url.endsWith("/api/show")) return { data: settings(body.model) };
    requests.push(body);
    return { data: { response: "OK" } };
  });
  for (const register of [registerRunOllamaTask, registerSummarizeOutput]) {
    let invoke!: (params: Record<string, unknown>) => Promise<any>;
    let schema!: Record<string, any>;
    register({ tool: (_name: string, _description: string, fields: Record<string, unknown>, handler: typeof invoke) => { schema = fields; invoke = handler; } } as unknown as McpServer);
    assert.equal(schema.model.parse(undefined), "qwen-context:h-q4_0-24k");
    for (const [model, context] of [["qwen-context:h-q4_0-24k", 24576], ["qwen-context:h-q4_0-50k", 50000], ["qwen-context:i-q8_0-32k", 32768]] as const) {
      const result = await invoke({ model, prompt: "Short task", text: "Short log" });
      assert.equal(result.content[0].text, "OK");
      assert.equal(result._meta.model_budget.sources.num_ctx, "model");
      assert.equal(result._meta.model_budget.sources.num_predict, "tool");
      assert.deepEqual(requests.at(-1)!.options, { num_ctx: context, num_predict: 8192 });
    }
    const explicit = await invoke({ model: "qwen-context:h-q4_0-50k", prompt: "Short task", text: "Short log", num_predict: 16000 });
    assert.equal(explicit._meta.model_budget.sources.num_predict, "request");
    assert.equal(requests.at(-1)!.options.num_predict, 16000);
    const before = requests.length;
    const overflow = await invoke({ model: "qwen-context:i-q8_0-32k", prompt: "x".repeat(50000), text: "x".repeat(50000) });
    assert.equal(JSON.parse(overflow.content[0].text).status, "input_overflow");
    assert.equal(requests.length, before);
  }
});

test("legacy chat loop inherits saved settings and stops before history overflows", async (t) => {
  t.mock.method(axios, "post", async (_url: string, body: Record<string, any>) => ({ data: settings(body.model) }));
  let options: unknown;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: string, request: RequestInit) => {
    calls++;
    options = JSON.parse(String(request.body)).options;
    return { json: async () => ({ message: { content: "OK" } }) };
  });
  const result = await runLocalExplorerTask({ task: "Short task", model: "qwen-context:h-q4_0-50k" });
  assert.deepEqual(options, { num_ctx: 50000, num_predict: 2048 });
  assert.match(result.text, /num_ctx=50000, num_predict=2048/);
  const overflow = await runLocalExplorerTask({ task: "x".repeat(50000), model: "qwen-context:i-q8_0-32k" });
  assert.equal(JSON.parse(overflow.text).status, "input_overflow");
  assert.equal(calls, 1);
});

test("advanced generation honors model settings and counts schema overhead", async (t) => {
  let options: unknown;
  let calls = 0;
  t.mock.method(axios, "post", async (url: string, body: Record<string, any>) => {
    if (url.endsWith("/api/show")) return { data: settings(body.model) };
    calls++;
    options = body.options;
    return { data: { response: "{}" } };
  });
  assert.equal(await generateWithModelBudget("qwen-context:h-q4_0-50k", "Short", "System", "json"), "{}");
  assert.deepEqual(options, { num_ctx: 50000, num_predict: 16000 });
  assert.equal(await generateWithModelBudget("qwen-context:i-q8_0-32k", "Short", "System", "json", false,
    { num_ctx: 16384, num_predict: 4096 }), "{}");
  assert.deepEqual(options, { num_ctx: 16384, num_predict: 4096 });
  await assert.rejects(generateWithModelBudget("qwen-context:i-q8_0-32k", "Short", "System", { description: "x".repeat(50000) }), /input_overflow/);
  assert.equal(calls, 2);
});


test("tool reserves never increase smaller saved ceilings or hide unbounded defaults", async () => {
  const saved = async () => ({ parameters: "num_ctx 50000\nnum_predict 1024" });
  const budget = await resolveModelBudget("fixture", {}, saved, 8192);
  assert.equal(budget.num_predict, 1024);
  assert.equal(budget.sources.num_predict, "model");
  const explicit = await resolveModelBudget("fixture", { num_predict: 16000 }, saved, 8192);
  assert.equal(explicit.num_predict, 16000);
  assert.equal(explicit.sources.num_predict, "request");
  await assert.rejects(resolveModelBudget("fixture", {}, async () => ({ parameters: "num_ctx 50000\nnum_predict -1" }), 8192), /finite positive/);
});

test("reports prompt, system, schema and template bytes without changing the conservative bound", async () => {
  const budget = await resolveModelBudget("fixture", {}, async () => ({ parameters: "num_ctx 50000\nnum_predict 16000", template: "{{ .Prompt }}" }));
  const content = { prompt: "café 🚧", system: "Preserve source", format: { type: "object", description: "নাম" } };
  const checked = checkInputBudget(budget, content);
  assert.deepEqual(checked.input_bytes, {
    prompt: Buffer.byteLength(content.prompt), system: Buffer.byteLength(content.system),
    schema: Buffer.byteLength(JSON.stringify(content.format)), template: Buffer.byteLength(budget.template),
  });
  assert.equal(checked.input_token_bound, checkInputBudget(budget, content.prompt + content.system + JSON.stringify(content.format)).input_token_bound);
});

test("matching tokenizer recovers capacity, charges schema and preserves explicit output reserves", async () => {
  const budget = { ...await resolveModelBudget("fixture", { num_predict: 16000 }, async () => settings("H")), tokenizer_path: "/fixture" };
  const content = { prompt: "x".repeat(49912), system: "System", format: { type: "object" } };
  assert.equal(checkInputBudget(budget, content).fits, false);
  const checked = await checkGenerationInputBudget(budget, content, false, async (_path, prompt, system) => {
    assert.equal(prompt, content.prompt); assert.equal(system, content.system); return 21007;
  });
  assert.equal(checked.fits, true);
  assert.equal(checked.accounting, "qwen35_gguf");
  assert.equal(checked.num_predict, 16000);
  assert.equal(checked.input_token_bound, 21007 + Buffer.byteLength(JSON.stringify(content.format)));
  const overflow = await checkGenerationInputBudget(budget, content, false, async () => budget.input_budget + 1);
  assert.equal(overflow.fits, false);
});

test("unsupported requests, tokenizer failure and invalid counts retain the byte refusal", async () => {
  const budget = { ...await resolveModelBudget("fixture", {}, async () => settings("H")), tokenizer_path: "/fixture" };
  const input = { prompt: "x".repeat(50000), system: "System" };
  for (const count of [async () => { throw new Error("unavailable"); }, async () => NaN, async () => -1, async () => 1.5]) {
    const checked = await checkGenerationInputBudget(budget, input, false, count);
    assert.equal(checked.fits, false); assert.equal(checked.accounting, "utf8_byte_bound");
  }
  const forbidden = async () => { throw new Error("must not run"); };
  assert.equal((await checkGenerationInputBudget(budget, input, true, forbidden)).accounting, "utf8_byte_bound");
  assert.equal((await checkGenerationInputBudget({ ...budget, tokenizer_path: undefined }, input, false, forbidden)).accounting, "utf8_byte_bound");
});

test("basic tools expose truncation, raw metrics and an explicit bounded deadline", async (t) => {
  const deadlines: number[] = [];
  t.mock.method(axios, "post", async (url: string, _body: unknown, config: { timeout: number }) => {
    if (url.endsWith("/api/show")) return { data: settings("H") };
    deadlines.push(config.timeout);
    return { data: { response: "partial", done: true, done_reason: "length", eval_count: 8192, prompt_eval_count: 10 } };
  });
  for (const register of [registerRunOllamaTask, registerSummarizeOutput]) {
    let invoke!: (params: Record<string, unknown>) => Promise<any>;
    register({ tool: (_name: string, _description: string, _fields: unknown, callback: typeof invoke) => { invoke = callback; } } as unknown as McpServer);
    const result = await invoke({ model: "H", prompt: "Task", text: "Log", timeout_ms: 240000 });
    assert.equal(result.isError, true); assert.equal(result.content[0].text, "partial");
    assert.equal(result._meta.completion.status, "incomplete");
    assert.equal(result._meta.completion.eval_count, 8192);
    assert.equal(result._meta.timeout_ms, 240000);
    const invalid = await invoke({ model: "H", prompt: "Task", text: "Log", timeout_ms: 900001 });
    assert.equal(invalid.isError, true);
  }
  assert.deepEqual(deadlines, [240000, 240000]);
});
