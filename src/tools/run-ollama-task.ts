import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_LOCAL_MODEL, TOOL_OUTPUT_RESERVES, OLLAMA_HOST, REQUEST_TIMEOUT_MS, checkInputBudget, generate, resolveModelBudget } from "../ollama-client.js";

export function registerRunOllamaTask(server: McpServer) {
  server.tool(
    "run_ollama_task",
    "Delegates a heavy code, text generation, or analysis sub-task to a local or cloud Ollama model.",
    {
      prompt: z.string().describe("The specific task or prompt to send to the Ollama model."),
      system_prompt: z.string().optional().describe("Optional instructions framing the model's role."),
      num_ctx: z.number().int().positive().optional().describe("Context override; inherits the model setting when omitted."),
      num_predict: z.number().int().positive().optional().describe("Output ceiling override; defaults to the smaller of the saved model ceiling and 8192 tokens."),
      model: z.string().default(DEFAULT_LOCAL_MODEL).describe("The Ollama model tag to invoke. Use list_ollama_models to see what's pulled."),
    },
    async ({ prompt, system_prompt, model, num_ctx, num_predict }) => {
      try {
        const system = system_prompt || "You are a specialized sub-agent assistant.";
        const budget = await resolveModelBudget(model, { num_ctx, num_predict }, undefined, TOOL_OUTPUT_RESERVES.delegation);
        const input = checkInputBudget(budget, { prompt, system });
        if (!input.fits) return { isError: true, content: [{ type: "text", text: JSON.stringify({ status: "input_overflow", budget: input }) }] };
        const text = await generate(model, prompt, system, undefined, false, { num_ctx: budget.num_ctx, num_predict: budget.num_predict });
        return { content: [{ type: "text", text }], _meta: { model_budget: input } };
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
