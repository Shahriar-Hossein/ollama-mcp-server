import axios from "axios";

export const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
export const REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 120_000;

export async function generate(model: string, prompt: string, system: string) {
  const response = await axios.post(
    `${OLLAMA_HOST}/api/generate`,
    { model, prompt, system, stream: false, think: false },
    { timeout: REQUEST_TIMEOUT_MS }
  );
  return response.data.response as string;
}

export async function listModels() {
  const response = await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: REQUEST_TIMEOUT_MS });
  return ((response.data.models || []) as any[]).map((m) => m.name as string);
}

/** Returns one vector per input using Ollama's local embedding API. */
export async function embed(model: string, input: string[]): Promise<number[][]> {
  if (!input.length) return [];
  let response;
  try {
    response = await axios.post(
      `${OLLAMA_HOST}/api/embed`,
      { model, input },
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
