import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerRunOllamaTask } from "./tools/run-ollama-task.js";
import { registerListOllamaModels } from "./tools/list-ollama-models.js";
import { registerSummarizeOutput } from "./tools/summarize-output.js";

const server = new McpServer({
  name: "ollama-subagent-bridge",
  version: "1.0.0",
});

registerRunOllamaTask(server);
registerListOllamaModels(server);
registerSummarizeOutput(server);

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((err) => {
  console.error("Fatal error starting MCP Server:", err);
  process.exit(1);
});
