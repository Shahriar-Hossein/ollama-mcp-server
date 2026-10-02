import axios from "axios";

export const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
export const REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 120_000;
export const DEFAULT_LOCAL_MODEL = "qwen-context:h-q4_0-50k";
export type ModelOptions = { num_ctx?: number; num_predict?: number };

export async function showModel(model: string) {
  const response = await axios.post(`${OLLAMA_HOST}/api/show`, { model }, { timeout: REQUEST_TIMEOUT_MS });
  return response.data as { parameters?: string; template?: string };
}

export async function resolveModelBudget(model: string, overrides: ModelOptions = {}, load = showModel) {
  const settings = await load(model);
  const saved = Object.fromEntries([...((settings.parameters ?? "").matchAll(/^\s*(num_ctx|num_predict)\s+(-?\d+)\s*$/gm))].map((match) => [match[1], Number(match[2])]));
  const source = (key: keyof ModelOptions) => overrides[key] !== undefined ? "request" : saved[key] !== undefined ? "model" : "fallback";
  const num_ctx = overrides.num_ctx ?? saved.num_ctx ?? 16_384;
  const num_predict = overrides.num_predict ?? saved.num_predict ?? 8_192;
  for (const [name, value] of Object.entries({ num_ctx, num_predict })) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a finite positive integer; set an explicit ceiling for unbounded model defaults.`);
  }
  const safety_margin = 1024;
  const input_budget = num_ctx - num_predict - safety_margin;
  if (input_budget <= 0) throw new Error("Output reserve and safety margin leave no input budget.");
  return { num_ctx, num_predict, safety_margin, input_budget, sources: { num_ctx: source("num_ctx"), num_predict: source("num_predict") }, template: settings.template ?? "" };
}

export function checkInputBudget(budget: Awaited<ReturnType<typeof resolveModelBudget>>, input: string) {
  // A UTF-8 byte bound is conservative for byte-tokenized Qwen; reject oversized input before Ollama can truncate it.
  const input_token_bound = Buffer.byteLength(input + budget.template, "utf8");
  const { template: _template, ...effective } = budget;
  return { ...effective, input_token_bound, accounting: "utf8_byte_bound" as const, fits: input_token_bound <= budget.input_budget };
}

export async function generate(
  model: string,
  prompt: string,
  system: string,
  format?: "json" | Record<string, unknown>,
  think = false,
  modelOptions?: ModelOptions
) {
  const response = await axios.post(
    `${OLLAMA_HOST}/api/generate`,
    { model, prompt, system, stream: false, think, ...(format ? { format } : {}), ...(modelOptions ? { options: modelOptions } : {}) },
    { timeout: REQUEST_TIMEOUT_MS }
  );
  // With think:true and a structured `format`, some models (e.g. qwen3.5) put the
  // actual formatted answer into `thinking` and leave `response` empty instead of
  // separating chain-of-thought from the final answer. Fall back to `thinking` so
  // callers that pass think:true don't see a silently empty response.
  return (response.data.response || response.data.thinking || "") as string;
}

export async function generateWithModelBudget(model: string, prompt: string, system: string, format?: "json" | Record<string, unknown>, think = false) {
  const budget = await resolveModelBudget(model);
  const input = checkInputBudget(budget, prompt + system + (format ? JSON.stringify(format) : ""));
  if (!input.fits) throw new Error(`input_overflow: ${JSON.stringify(input)}`);
  return generate(model, prompt, system, format, think, { num_ctx: budget.num_ctx, num_predict: budget.num_predict });
}

export async function listModels() {
  const response = await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: REQUEST_TIMEOUT_MS });
  return ((response.data.models || []) as any[]).map((m) => m.name as string);
}

/** Returns one vector per input using Ollama's local embedding API. Unloads
 * the embedding model immediately after (keep_alive: 0) so it doesn't sit
 * resident in GPU memory competing with the generation model that runs next. */
export async function embed(model: string, input: string[]): Promise<number[][]> {
  if (!input.length) return [];
  let response;
  try {
    response = await axios.post(
      `${OLLAMA_HOST}/api/embed`,
      { model, input, keep_alive: "0" },
      { timeout: REQUEST_TIMEOUT_MS }
    );
  } catch (error: any) {
    if (error.response?.status === 501) {
      throw new Error(`Ollama at ${OLLAMA_HOST} does not have embedding support enabled. Start it with --embeddings and use an embedding-capable model.`);
    }
    throw error;
  }
  const embeddings = response.data.embeddings;
  if (!Array.isArray(embeddings) || !embeddings.every((vector: unknown) => Array.isArray(vector) && vector.every((value: unknown) => typeof value === "number"))) {
    throw new Error(`Ollama embedding response for ${model} did not contain numeric embeddings.`);
  }
  return embeddings as number[][];
}
