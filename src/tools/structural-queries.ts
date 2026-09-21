import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findCallees, findCallers, findReferences, findSymbol } from "../explorer/structural-tools.js";

const repositoryRoot = z.string().describe("Absolute path to the Git repository root to explore.");
const symbolId = z.string().describe("Stable indexed symbol ID returned by outline_file or find_symbol.");

function result(run: () => unknown, failure: string) {
  try {
    return { content: [{ type: "text" as const, text: JSON.stringify(run()) }] };
  } catch (error: any) {
    return { isError: true, content: [{ type: "text" as const, text: `${failure}: ${error.message}` }] };
  }
}

export function registerStructuralQueries(server: McpServer) {
  server.tool(
    "find_symbol",
    "Finds indexed declarations by stable ID, exact name or qualified name, or partial name. Use the returned stable IDs with the relationship tools.",
    { repository_root: repositoryRoot, query: z.string().describe("Stable symbol ID, declaration name, or qualified name to find.") },
    async ({ repository_root, query }) => result(() => findSymbol(repository_root, query), `Failed to find symbol ${query}`)
  );
  server.tool(
    "find_references",
    "Finds indexed references that resolved to one declaration. Unresolved occurrences are deliberately excluded.",
    { repository_root: repositoryRoot, symbol_id: symbolId },
    async ({ repository_root, symbol_id }) => result(() => findReferences(repository_root, symbol_id), `Failed to find references for ${symbol_id}`)
  );
  server.tool(
    "find_callers",
    "Finds indexed call sites whose callee resolved to one declaration. Each result includes its resolution quality.",
    { repository_root: repositoryRoot, symbol_id: symbolId },
    async ({ repository_root, symbol_id }) => result(() => findCallers(repository_root, symbol_id), `Failed to find callers for ${symbol_id}`)
  );
  server.tool(
    "find_callees",
    "Finds indexed call sites made from within one declaration. Each result includes its resolution quality.",
    { repository_root: repositoryRoot, symbol_id: symbolId },
    async ({ repository_root, symbol_id }) => result(() => findCallees(repository_root, symbol_id), `Failed to find callees for ${symbol_id}`)
  );
}
