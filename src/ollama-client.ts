import axios from "axios";
import { countQwenInput, matchingQwenPath } from "./qwen-tokenizer.js";

export const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
export const REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 120_000;
export const DEFAULT_LOCAL_MODEL = "qwen-context:h-q4_0-24k";
export const TOOL_OUTPUT_RESERVES = { delegation: 8192, summary: 8192, scout: 2048 } as const;
export type ModelOptions = { num_ctx?: number; num_predict?: number };
export function requestTimeout(timeout_ms = REQUEST_TIMEOUT_MS) {
  if (!Number.isSafeInteger(timeout_ms) || timeout_ms < 1000 || timeout_ms > 900_000)
    throw new Error("timeout_ms must be an integer between 1000 and 900000.");
  return timeout_ms;
}
export function describeOllamaError(error: any, model: string, timeout_ms?: number) {
  if (error.code === "ECONNABORTED")
    return `Ollama request timed out after ${timeout_ms ?? REQUEST_TIMEOUT_MS}ms (model: ${model}).`;
  const res = error.response;
  if (res) {
    const detail = typeof res.data?.error === "string" ? res.data.error : error.message;
    return `Ollama returned HTTP ${res.status} (model: ${model}): ${detail}`;
  }
  return `Failed to reach Ollama at ${OLLAMA_HOST}: ${error.message}. Make sure 'ollama serve' is running.`;
}
type ModelSettings = { parameters?: string; template?: string; modelfile?: string };
const MODEL_SETTINGS_TTL_MS = 60_000;
const modelSettingsCache = new Map<string, { expires: number; settings: Promise<ModelSettings> }>();

export function clearModelSettingsCache(model?: string) {
  if (model === undefined) modelSettingsCache.clear();
  else modelSettingsCache.delete(model);
}

export async function showModel(model: string) {
  const cached = modelSettingsCache.get(model);
  if (cached && cached.expires > Date.now()) return cached.settings;
  const settings = axios
    .post(`${OLLAMA_HOST}/api/show`, { model }, { timeout: REQUEST_TIMEOUT_MS })
    .then((response) => response.data as ModelSettings);
  modelSettingsCache.set(model, { expires: Date.now() + MODEL_SETTINGS_TTL_MS, settings });
  try {
    return await settings;
  } catch (error) {
    if (modelSettingsCache.get(model)?.settings === settings) modelSettingsCache.delete(model);
    throw error;
  }
}

export async function resolveModelBudget(
  model: string,
  overrides: ModelOptions = {},
  load = showModel,
  outputReserve?: number,
) {
  const settings = await load(model);
  const saved = Object.fromEntries(
    [...(settings.parameters ?? "").matchAll(/^\s*(num_ctx|num_predict)\s+(-?\d+)\s*$/gm)].map(
      (match) => [match[1], Number(match[2])],
    ),
  );
  const source = (key: keyof ModelOptions) =>
    overrides[key] !== undefined
      ? "request"
      : key === "num_predict" && toolReserveApplied
        ? "tool"
        : saved[key] !== undefined
          ? "model"
          : "fallback";
  const num_ctx = overrides.num_ctx ?? saved.num_ctx ?? 16_384;
  const selectedOutput = overrides.num_predict ?? saved.num_predict ?? 8_192;
  if (outputReserve !== undefined && (!Number.isSafeInteger(outputReserve) || outputReserve <= 0))
    throw new Error("Tool output reserve must be a finite positive integer.");
  if (!Number.isSafeInteger(selectedOutput) || selectedOutput <= 0)
    throw new Error(
      "num_predict must be a finite positive integer; set an explicit ceiling for unbounded model defaults.",
    );
  const toolReserveApplied =
    overrides.num_predict === undefined &&
    outputReserve !== undefined &&
    outputReserve < selectedOutput;
  const num_predict = toolReserveApplied ? outputReserve! : selectedOutput;
  for (const [name, value] of Object.entries({ num_ctx, num_predict })) {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error(
        `${name} must be a finite positive integer; set an explicit ceiling for unbounded model defaults.`,
      );
  }
  const safety_margin = 1024;
  const input_budget = num_ctx - num_predict - safety_margin;
  if (input_budget <= 0) throw new Error("Output reserve and safety margin leave no input budget.");
  return {
    num_ctx,
    num_predict,
    safety_margin,
    input_budget,
    sources: { num_ctx: source("num_ctx"), num_predict: source("num_predict") },
    template: settings.template ?? "",
    tokenizer_path: matchingQwenPath(settings),
  };
}

type InputContent =
  | string
  | { prompt: string; system: string; format?: "json" | Record<string, unknown> };

export function checkInputBudget(
  budget: Awaited<ReturnType<typeof resolveModelBudget>>,
  input: InputContent,
) {
  const content =
    typeof input === "string"
      ? { input }
      : {
          prompt: input.prompt,
          system: input.system,
          schema: input.format ? JSON.stringify(input.format) : "",
        };
  const input_bytes = Object.fromEntries(
    Object.entries({ ...content, template: budget.template }).map(([name, text]) => [
      name,
      Buffer.byteLength(text, "utf8"),
    ]),
  );
  // Unsupported generation configurations and chat histories keep this fallback.
  const input_token_bound = Object.values(input_bytes).reduce((sum, bytes) => sum + bytes, 0);
  const { template: _template, tokenizer_path: _path, ...effective } = budget;
  return {
    ...effective,
    input_bytes,
    input_token_bound,
    accounting: "utf8_byte_bound" as const,
    fits: input_token_bound <= budget.input_budget,
  };
}

export async function checkGenerationInputBudget(
  budget: Awaited<ReturnType<typeof resolveModelBudget>>,
  input: Exclude<InputContent, string>,
  think = false,
  count = countQwenInput,
) {
  const fallback = checkInputBudget(budget, input);
  if (!budget.tokenizer_path || think)
    return { ...fallback, tokenizer_fallback: "unsupported_model_or_request" };
  try {
    const prompt_tokens = await count(budget.tokenizer_path, input.prompt, input.system);
    if (!Number.isSafeInteger(prompt_tokens) || prompt_tokens < 0)
      throw new Error("Invalid tokenizer count.");
    // Formats constrain decoding; keep their byte charge as an additional reserve.
    const input_token_bound = prompt_tokens + fallback.input_bytes.schema;
    return {
      ...fallback,
      accounting: "qwen35_gguf" as const,
      prompt_tokens,
      input_token_bound,
      fits: input_token_bound <= budget.input_budget,
      tokenizer_fallback: undefined,
    };
  } catch {
    return { ...fallback, tokenizer_fallback: "tokenizer_unavailable_or_input_unsupported" };
  }
}

export async function generateResult(
  model: string,
  prompt: string,
  system: string,
  format?: "json" | Record<string, unknown>,
  think = false,
  modelOptions?: ModelOptions,
  timeout_ms?: number,
) {
  const response = await axios.post(
    `${OLLAMA_HOST}/api/generate`,
    {
      model,
      prompt,
      system,
      stream: false,
      think,
      ...(format ? { format } : {}),
      ...(modelOptions ? { options: modelOptions } : {}),
    },
    { timeout: requestTimeout(timeout_ms) },
  );
  // With think:true and a structured `format`, some models (e.g. qwen3.5) put the
  // actual formatted answer into `thinking` and leave `response` empty instead of
  // separating chain-of-thought from the final answer. Fall back to `thinking` so
  // callers that pass think:true don't see a silently empty response.
  const {
    done,
    done_reason,
    prompt_eval_count,
    eval_count,
    total_duration,
    load_duration,
    prompt_eval_duration,
    eval_duration,
  } = response.data;
  return {
    text: (response.data.response || response.data.thinking || "") as string,
    completion: {
      status:
        done_reason === "length" || done === false
          ? "incomplete"
          : done === true
            ? "complete"
            : "unknown",
      done,
      done_reason,
      prompt_eval_count,
      eval_count,
      total_duration,
      load_duration,
      prompt_eval_duration,
      eval_duration,
    },
  };
}

export async function generate(
  model: string,
  prompt: string,
  system: string,
  format?: "json" | Record<string, unknown>,
  think = false,
  modelOptions?: ModelOptions,
) {
  return (await generateResult(model, prompt, system, format, think, modelOptions)).text;
}

export async function generateWithModelBudget(
  model: string,
  prompt: string,
  system: string,
  format?: "json" | Record<string, unknown>,
  think = false,
  modelOptions?: ModelOptions,
) {
  const budget = await resolveModelBudget(model, modelOptions);
  const input = await checkGenerationInputBudget(budget, { prompt, system, format }, think);
  if (!input.fits) throw new Error(`input_overflow: ${JSON.stringify(input)}`);
  return generate(model, prompt, system, format, think, {
    num_ctx: budget.num_ctx,
    num_predict: budget.num_predict,
  });
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
      { timeout: REQUEST_TIMEOUT_MS },
    );
  } catch (error: any) {
    if (error.response?.status === 501) {
      throw new Error(
        `Ollama at ${OLLAMA_HOST} does not have embedding support enabled. Start it with --embeddings and use an embedding-capable model.`,
      );
    }
    throw error;
  }
  const embeddings = response.data.embeddings;
  if (
    !Array.isArray(embeddings) ||
    !embeddings.every(
      (vector: unknown) =>
        Array.isArray(vector) && vector.every((value: unknown) => typeof value === "number"),
    )
  ) {
    throw new Error(`Ollama embedding response for ${model} did not contain numeric embeddings.`);
  }
  return embeddings as number[][];
}
