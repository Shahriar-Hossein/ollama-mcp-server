import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadFeatures } from "./config/features.js";
import { registerRunOllamaTask } from "./tools/run-ollama-task.js";
import { registerListOllamaModels } from "./tools/list-ollama-models.js";
import { registerSummarizeOutput } from "./tools/summarize-output.js";
import { registerOutlineFile } from "./tools/outline-file.js";
import { registerReadSymbol } from "./tools/read-symbol.js";
import { registerStructuralQueries } from "./tools/structural-queries.js";
import { registerHybridRetrieval } from "./tools/hybrid-retrieval.js";

const server = new McpServer({
  name: "ollama-subagent-bridge",
  version: "1.0.0",
});
const features = loadFeatures();

// Supported core: basic Ollama delegation and deterministic repository intelligence.
registerRunOllamaTask(server);
registerListOllamaModels(server);
registerSummarizeOutput(server);
registerOutlineFile(server);
registerReadSymbol(server);
registerStructuralQueries(server);
registerHybridRetrieval(server, features.semanticSearch && features.gitHistory);

async function registerOptionalTools() {
  const advancedRetrieval = features.semanticSearch && features.gitHistory;
  if (features.localExplorerTask) {
    const [{ registerLocalExplorerTask }, { registerLocalExploreRepo }] = await Promise.all([
      import("./experimental/tools/local-explorer-task.js"),
      import("./experimental/tools/local-explore-repo.js"),
    ]);
    registerLocalExplorerTask(server);
    registerLocalExploreRepo(server);
  }
  if (features.semanticSearch) {
    const { registerSemanticSearch } = await import("./experimental/tools/semantic-search.js");
    registerSemanticSearch(server);
  }
  if (features.knowledgeStore) {
    const { registerSaveKnowledgeUpdates } = await import("./experimental/tools/save-knowledge-updates.js");
    registerSaveKnowledgeUpdates(server);
  }
  if (features.verificationPipeline) {
    const [{ registerDiscoverEvidence }, { registerVerifyClaims }, { registerSynthesizeVerifiedAnswer }] = await Promise.all([
      import("./experimental/tools/discover-evidence.js"),
      import("./experimental/tools/verify-claims.js"),
      import("./experimental/tools/synthesize-verified-answer.js"),
    ]);
    registerDiscoverEvidence(server, advancedRetrieval);
    registerVerifyClaims(server);
    registerSynthesizeVerifiedAnswer(server);
  }
  if (features.fullExplorer) {
    const { registerExploreRepository } = await import("./experimental/tools/explore-repository.js");
    registerExploreRepository(server, advancedRetrieval);
  }

  // Autonomous and Git-writing: independently opt-in; never enabled by ENABLE_EXPERIMENTAL.
  if (features.cloudClaudeWorker) {
    const { registerRunCloudClaudeTask } = await import("./experimental/workers/run-cloud-claude-task.js");
    registerRunCloudClaudeTask(server);
  }
  if (features.localWorker) {
    const { registerRunLocalWorkerTask } = await import("./experimental/workers/run-local-worker-task.js");
    registerRunLocalWorkerTask(server);
  }
}

async function run() {
  await registerOptionalTools();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((err) => {
  console.error("Fatal error starting MCP Server:", err);
  process.exit(1);
});
