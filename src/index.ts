import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadFeatures } from "./config/features.js";
import { registerRunOllamaTask } from "./tools/run-ollama-task.js";
import { registerListOllamaModels } from "./tools/list-ollama-models.js";
import { registerSummarizeOutput } from "./tools/summarize-output.js";
import { registerRunCloudClaudeTask } from "./tools/run-cloud-claude-task.js";
import { registerRunLocalWorkerTask } from "./tools/run-local-worker-task.js";
import { registerLocalExplorerTask } from "./tools/local-explorer-task.js";
import { registerOutlineFile } from "./tools/outline-file.js";
import { registerReadSymbol } from "./tools/read-symbol.js";
import { registerStructuralQueries } from "./tools/structural-queries.js";
import { registerSemanticSearch } from "./tools/semantic-search.js";
import { registerHybridRetrieval } from "./tools/hybrid-retrieval.js";
import { registerSaveKnowledgeUpdates } from "./tools/save-knowledge-updates.js";
import { registerDiscoverEvidence } from "./tools/discover-evidence.js";
import { registerVerifyClaims } from "./tools/verify-claims.js";
import { registerSynthesizeVerifiedAnswer } from "./tools/synthesize-verified-answer.js";
import { registerExploreRepository } from "./tools/explore-repository.js";

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

// Experimental: present in the repository, but absent from the default MCP surface.
if (features.localExplorerTask) registerLocalExplorerTask(server);
if (features.semanticSearch) registerSemanticSearch(server);
if (features.knowledgeStore) registerSaveKnowledgeUpdates(server);
if (features.verificationPipeline) {
  registerDiscoverEvidence(server, features.semanticSearch && features.gitHistory);
  registerVerifyClaims(server);
  registerSynthesizeVerifiedAnswer(server);
}
if (features.fullExplorer) registerExploreRepository(server, features.semanticSearch && features.gitHistory);

// Autonomous and Git-writing: independently opt-in; never enabled by ENABLE_EXPERIMENTAL.
if (features.cloudClaudeWorker) registerRunCloudClaudeTask(server);
if (features.localWorker) registerRunLocalWorkerTask(server);

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((err) => {
  console.error("Fatal error starting MCP Server:", err);
  process.exit(1);
});
