import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  DEFAULT_LOCAL_MODEL,
  TOOL_OUTPUT_RESERVES,
  checkGenerationInputBudget,
  describeOllamaError,
  generateResult,
  startDeadline,
  resolveModelBudget,
} from "../ollama-client.js";
import { outputFormat } from "./run-ollama-task.js";

const DEFAULT_SYSTEM_PROMPT =
  "You condense large, noisy text (logs, command output, file dumps) into a short, faithful summary. " +
  "Preserve concrete details that matter (errors, file paths, line numbers, failing test names, exit codes). " +
  "When the text is split into labeled files or sections, attribute each fact to its own label. " +
  "Omit anything the text does not state. Drop repetition and boilerplate. Be terse.";

export function registerSummarizeOutput(server: McpServer) {
  server.tool(
    "summarize_output",
    "Condenses large text (logs, command output, file dumps) into a short summary using a local Ollama model, " +
      "so the full text never has to enter the caller's own context.",
    {
      text: z.string().describe("The large text to summarize (log output, file contents, etc.)."),
      focus: z
        .string()
        .optional()
        .describe("What to focus on, e.g. 'errors and failing tests only'."),
      num_ctx: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Context override; inherits the model setting when omitted."),
      num_predict: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Output ceiling override; defaults to the smaller of the saved model ceiling and 8192 tokens.",
        ),
      timeout_ms: z
        .number()
        .int()
        .min(1000)
        .max(900000)
        .optional()
        .describe(
          "Request deadline in milliseconds; defaults to the server's configured deadline (120 seconds by default).",
        ),
      format: outputFormat,
      model: z
        .string()
        .default(DEFAULT_LOCAL_MODEL)
        .describe("The Ollama model tag to invoke. Use list_ollama_models to see what's pulled."),
    },
    async ({ text, focus, model, num_ctx, num_predict, timeout_ms, format }) => {
      const prompt = focus
        ? `Focus: ${focus}\n\nText to summarize:\n${text}`
        : `Text to summarize:\n${text}`;
      try {
        const clock = startDeadline(timeout_ms);
        const budget = await resolveModelBudget(
          model,
          { num_ctx, num_predict },
          undefined,
          TOOL_OUTPUT_RESERVES.summary,
        );
        const input = await checkGenerationInputBudget(budget, {
          prompt,
          system: DEFAULT_SYSTEM_PROMPT,
          format,
        });
        if (!input.fits)
          return {
            isError: true,
            content: [
              { type: "text", text: JSON.stringify({ status: "input_overflow", budget: input }) },
            ],
          };
        const { text: summary, completion } = await generateResult(
          model,
          prompt,
          DEFAULT_SYSTEM_PROMPT,
          format,
          false,
          { num_ctx: budget.num_ctx, num_predict: budget.num_predict },
          clock.remaining(),
        );
        return {
          ...(completion.status === "incomplete" ? { isError: true } : {}),
          content: [{ type: "text", text: summary }],
          _meta: { model_budget: input, completion, timeout_ms: clock.total },
        };
      } catch (error: any) {
        const message = describeOllamaError(error, model, timeout_ms);
        return { isError: true, content: [{ type: "text", text: message }] };
      }
    },
  );
}
