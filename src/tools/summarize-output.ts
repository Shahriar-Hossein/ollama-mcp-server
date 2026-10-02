import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_LOCAL_MODEL, OLLAMA_HOST, REQUEST_TIMEOUT_MS, checkInputBudget, generate, resolveModelBudget } from "../ollama-client.js";

const DEFAULT_SYSTEM_PROMPT =
  "You condense large, noisy text (logs, command output, file dumps) into a short, faithful summary. " +
  "Preserve concrete details that matter (errors, file paths, line numbers, failing test names, exit codes). " +
  "Drop repetition and boilerplate. Be terse.";

export function registerSummarizeOutput(server: McpServer) {
  server.tool(
    "summarize_output",
    "Condenses large text (logs, command output, file dumps) into a short summary using a local Ollama model, " +
      "so the full text never has to enter the caller's own context.",
    {
      text: z.string().describe("The large text to summarize (log output, file contents, etc.)."),
      focus: z.string().optional().describe("What to focus on, e.g. 'errors and failing tests only'."),
      num_ctx: z.number().int().positive().optional().describe("Context override; inherits the model setting when omitted."),
      num_predict: z.number().int().positive().optional().describe("Output ceiling override; inherits the model setting when omitted."),
      model: z.string().default(DEFAULT_LOCAL_MODEL).describe("The Ollama model tag to invoke. Use list_ollama_models to see what's pulled."),
    },
    async ({ text, focus, model, num_ctx, num_predict }) => {
      const prompt = focus
        ? `Focus: ${focus}\n\nText to summarize:\n${text}`
        : `Text to summarize:\n${text}`;
      try {
        const budget = await resolveModelBudget(model, { num_ctx, num_predict });
        const input = checkInputBudget(budget, prompt + DEFAULT_SYSTEM_PROMPT);
        if (!input.fits) return { isError: true, content: [{ type: "text", text: JSON.stringify({ status: "input_overflow", budget: input }) }] };
        const summary = await generate(model, prompt, DEFAULT_SYSTEM_PROMPT, undefined, false, { num_ctx: budget.num_ctx, num_predict: budget.num_predict });
        return { content: [{ type: "text", text: summary }], _meta: { model_budget: input } };
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
