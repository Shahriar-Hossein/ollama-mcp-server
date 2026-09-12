import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { z } from "zod";

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
    model: z.string().default("qwen2.5-coder:latest").describe("The Ollama model tag to invoke."),
  },
  async ({ prompt, system_prompt, model }) => {
    try {
      // Call Ollama local API endpoint
      const response = await axios.post("http://localhost:11434/api/generate", {
        model: model,
        prompt: prompt,
        system: system_prompt || "You are a specialized sub-agent assistant.",
        stream: false, // Wait for full output before returning to Claude
      });

      return {
        content: [
          {
            type: "text",
            text: response.data.response,
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Failed to reach Ollama: ${error.message}. Make sure 'ollama serve' is running.`,
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