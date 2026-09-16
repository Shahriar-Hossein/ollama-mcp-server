import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { semanticSearch } from "../super-explorer/semantic-search.js";

export function registerSemanticSearch(server: McpServer) {
  server.tool(
    "semantic_search",
    "Searches indexed declarations by local Ollama embedding similarity. Results cite source symbols; verify them with read_symbol before making claims.",
    {
      repository_root: z.string().describe("Absolute path to the Git repository root to explore."),
      query: z.string().describe("Natural-language or identifier query."),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum results; defaults to 10."),
      model: z.string().optional().describe("Local Ollama embedding model; defaults to SUPER_EXPLORER_EMBEDDING_MODEL or nomic-embed-text."),
    },
    async ({ repository_root, query, limit, model }) => {
      try {
        return { content: [{ type: "text", text: JSON.stringify(await semanticSearch(repository_root, query, limit, model)) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Failed semantic search: ${error.message}` }] };
      }
    }
  );
}
