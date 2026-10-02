import assert from "node:assert/strict";
import test from "node:test";
import axios from "axios";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { checkInputBudget, generateWithModelBudget, resolveModelBudget } from "./ollama-client.js";
import { registerRunOllamaTask } from "./tools/run-ollama-task.js";
import { registerSummarizeOutput } from "./tools/summarize-output.js";
import { runLocalExplorerTask } from "./experimental/tools/local-explorer-task.js";

const settings = (model: string) => ({ parameters: `num_ctx ${model.includes(":i-") ? 32768 : 50000}\nnum_predict 25000`, template: "{{ .System }}{{ .Prompt }}" });

test("inherits H/I settings and reserves their full output ceiling", async () => {
  for (const [model, input_budget] of [["qwen-context:h-q4_0-50k", 23976], ["qwen-context:i-q8_0-32k", 6744]] as const) {
    const budget = await resolveModelBudget(model, {}, async () => settings(model));
    assert.equal(budget.input_budget, input_budget);
    assert.equal(budget.num_predict, 25000);
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
  await assert.rejects(resolveModelBudget("fixture", { num_ctx: 25000 }, async () => settings("H")), /no input budget/);
  await assert.rejects(resolveModelBudget("fixture", { num_predict: 1.5 }, async () => settings("H")), /finite positive/);
});

test("basic MCP tools pass the selected tag's saved settings to generation", async (t) => {
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
    assert.equal(schema.model.parse(undefined), "qwen-context:h-q4_0-50k");
    for (const model of ["qwen-context:h-q4_0-50k", "qwen-context:i-q8_0-32k"]) {
      const result = await invoke({ model, prompt: "Short task", text: "Short log" });
      assert.equal(result.content[0].text, "OK");
      assert.equal(result._meta.model_budget.sources.num_ctx, "model");
      assert.deepEqual(requests.at(-1)!.options, { num_ctx: settings(model).parameters.includes("32768") ? 32768 : 50000, num_predict: 25000 });
    }
    const before = requests.length;
    const overflow = await invoke({ model: "qwen-context:i-q8_0-32k", prompt: "x".repeat(7000), text: "x".repeat(7000) });
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
  assert.deepEqual(options, { num_ctx: 50000, num_predict: 25000 });
  assert.match(result.text, /num_ctx=50000, num_predict=25000/);
  const overflow = await runLocalExplorerTask({ task: "x".repeat(7000), model: "qwen-context:i-q8_0-32k" });
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
  assert.deepEqual(options, { num_ctx: 50000, num_predict: 25000 });
  await assert.rejects(generateWithModelBudget("qwen-context:i-q8_0-32k", "Short", "System", { description: "x".repeat(7000) }), /input_overflow/);
  assert.equal(calls, 1);
});
