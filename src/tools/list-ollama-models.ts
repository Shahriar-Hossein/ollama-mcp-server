import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OLLAMA_HOST, listModels } from "../ollama-client.js";

export function registerListOllamaModels(server: McpServer) {
  server.tool(
    "list_ollama_models",
    "Lists Ollama models currently available (pulled locally, or signed-in cloud models) so a suitable one can be picked for run_ollama_task.",
    {},
    async () => {
      try {
        const models = await listModels();
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
}
