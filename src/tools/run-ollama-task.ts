import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { OLLAMA_HOST, REQUEST_TIMEOUT_MS, generate } from "../ollama-client.js";

export function registerRunOllamaTask(server: McpServer) {
  server.tool(
    "run_ollama_task",
    "Delegates a heavy code, text generation, or analysis sub-task to a local or cloud Ollama model.",
    {
      prompt: z.string().describe("The specific task or prompt to send to the Ollama model."),
      system_prompt: z.string().optional().describe("Optional instructions framing the model's role."),
      model: z.string().default("qwen2.5-coder:3b").describe("The Ollama model tag to invoke. Use list_ollama_models to see what's pulled."),
    },
    async ({ prompt, system_prompt, model }) => {
      try {
        const text = await generate(model, prompt, system_prompt || "You are a specialized sub-agent assistant.");
        return { content: [{ type: "text", text }] };
      } catch (error: any) {
        const message =
          error.code === "ECONNABORTED"
            ? `Ollama request timed out after ${REQUEST_TIMEOUT_MS}ms (model: ${model}).`
            : `Failed to reach Ollama at ${OLLAMA_HOST}: ${error.message}. Make sure 'ollama serve' is running.`;
        return { isError: true, content: [{ type: "text", text: message }] };
      }
    }
  );
}
