import axios from "axios";

export const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
export const REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 120_000;

export async function generate(
  model: string,
  prompt: string,
  system: string,
  format?: "json" | Record<string, unknown>,
  think = false,
  modelOptions?: { num_ctx?: number; num_predict?: number }
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
