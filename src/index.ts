import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerRunOllamaTask } from "./tools/run-ollama-task.js";
import { registerListOllamaModels } from "./tools/list-ollama-models.js";
import { registerSummarizeOutput } from "./tools/summarize-output.js";
import { registerRunCloudClaudeTask } from "./tools/run-cloud-claude-task.js";
import { registerRunLocalWorkerTask } from "./tools/run-local-worker-task.js";

const server = new McpServer({
  name: "ollama-subagent-bridge",
  version: "1.0.0",
});

registerRunOllamaTask(server);
registerListOllamaModels(server);
registerSummarizeOutput(server);

// Autonomous shell-executing tools: opt-in only, off by default. See
// docs/local-claude-worker-experiment-2026-09-14.md for why the cloud model
// approach is used for run_cloud_claude_task.
if (process.env.CLOUD_CLAUDE_ENABLED === "1") registerRunCloudClaudeTask(server);
if (process.env.LOCAL_WORKER_ENABLED === "1") registerRunLocalWorkerTask(server);

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((err) => {
  console.error("Fatal error starting MCP Server:", err);
  process.exit(1);
});