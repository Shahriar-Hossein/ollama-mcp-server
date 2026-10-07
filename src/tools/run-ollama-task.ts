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

export const outputFormat = z
  .union([z.literal("json"), z.record(z.string(), z.unknown())])
  .optional()
  .describe(
    'Constrain output: "json" for any JSON, or a JSON Schema object to force an exact shape.',
  );

export function registerRunOllamaTask(server: McpServer) {
  server.tool(
    "run_ollama_task",
    "Delegates a heavy code, text generation, or analysis sub-task to a local or cloud Ollama model.",
    {
      prompt: z.string().describe("The specific task or prompt to send to the Ollama model."),
      system_prompt: z
        .string()
        .optional()
        .describe("Optional instructions framing the model's role."),
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
    async ({ prompt, system_prompt, model, num_ctx, num_predict, timeout_ms, format }) => {
      try {
        const clock = startDeadline(timeout_ms);
        const system = system_prompt || "You are a specialized sub-agent assistant.";
        const budget = await resolveModelBudget(
          model,
          { num_ctx, num_predict },
          undefined,
          TOOL_OUTPUT_RESERVES.delegation,
        );
        const input = await checkGenerationInputBudget(budget, { prompt, system, format });
        if (!input.fits)
          return {
            isError: true,
            content: [
              { type: "text", text: JSON.stringify({ status: "input_overflow", budget: input }) },
            ],
          };
        const { text, completion } = await generateResult(
          model,
          prompt,
          system,
          format,
          false,
          { num_ctx: budget.num_ctx, num_predict: budget.num_predict },
          clock.remaining(),
        );
        return {
          ...(completion.status === "incomplete" ? { isError: true } : {}),
          content: [{ type: "text", text }],
          _meta: { model_budget: input, completion, timeout_ms: clock.total },
        };
      } catch (error: any) {
        const message = describeOllamaError(error, model, timeout_ms);
        return { isError: true, content: [{ type: "text", text: message }] };
      }
    },
  );
}
