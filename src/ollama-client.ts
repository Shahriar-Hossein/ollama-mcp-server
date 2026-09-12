import axios from "axios";

export const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
export const REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 120_000;

export async function generate(model: string, prompt: string, system: string) {
  const response = await axios.post(
    `${OLLAMA_HOST}/api/generate`,
    { model, prompt, system, stream: false },
    { timeout: REQUEST_TIMEOUT_MS }
  );
  return response.data.response as string;
}

export async function listModels() {
  const response = await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: REQUEST_TIMEOUT_MS });
  return ((response.data.models || []) as any[]).map((m) => m.name as string);
}
