import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { z } from "zod";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 120_000;

// Initialize the MCP Server
const server = new McpServer({
  name: "ollama-subagent-bridge",
  version: "1.0.0",
});

// Register the tool that Claude will call
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
      const response = await axios.post(
        `${OLLAMA_HOST}/api/generate`,
        {
          model: model,
          prompt: prompt,
          system: system_prompt || "You are a specialized sub-agent assistant.",
          stream: false, // Wait for full output before returning to Claude
        },
        { timeout: REQUEST_TIMEOUT_MS }
      );

      return {
        content: [
          {
            type: "text",
            text: response.data.response,
          },
        ],
      };
    } catch (error: any) {
      const message =
        error.code === "ECONNABORTED"
          ? `Ollama request timed out after ${REQUEST_TIMEOUT_MS}ms (model: ${model}).`
          : `Failed to reach Ollama at ${OLLAMA_HOST}: ${error.message}. Make sure 'ollama serve' is running.`;
      return {
        isError: true,
        content: [{ type: "text", text: message }],
      };
    }
  }
);

// Lets Claude check what's actually pulled before picking a model to delegate to
server.tool(
  "list_ollama_models",
  "Lists Ollama models currently available (pulled locally, or signed-in cloud models) so a suitable one can be picked for run_ollama_task.",
  {},
  async () => {
    try {
      const response = await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: REQUEST_TIMEOUT_MS });
      const models = (response.data.models || []).map((m: any) => m.name);
      return {
        content: [{ type: "text", text: models.length ? models.join("\n") : "No models found." }],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Failed to list Ollama models at ${OLLAMA_HOST}: ${error.message}. Make sure 'ollama serve' is running.`,
          },
        ],
      };
    }
  }
);

// Connect over stdio (Standard I/O is how Claude Code communicates with local tools)
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((err) => {
  console.error("Fatal error starting MCP Server:", err);
  process.exit(1);
});