import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ALLOWED_TOOLS_FLAG, CLAUDE_SYSTEM_PROMPT } from "../shell-allowlist.js";

// Runs the full `ollama launch claude` binary (real Claude Code harness)
// against an Ollama *cloud* model, not local. Local models were tried for
// this (see docs/planning/local-claude-worker-experiment.md, Tier 1) and
// ruled out: the harness needs a large context window (Ollama itself
// recommends >=64k) to carry CLAUDE.md/skills/system-prompt overhead, and
// this machine's GPU can't give a local model that much context. Cloud
// models can, so no --bare/--disable-slash-commands/--strict-mcp-config here
// - run with the harness at full strength, same as a normal session.
const SPAWN_TIMEOUT_MS = 600_000;

// --allowedTools alone isn't a security boundary (Claude Code's own docs say
// so): it splits &&/;/| chains but doesn't catch `bash -c '...'` wrapping,
// `git -c core.editor=...` flag injection, or absolute-path invocation. This
// PreToolUse hook re-checks every Bash call independently - see
// scripts/validate-cloud-bash.cjs for the actual logic.
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASH_VALIDATOR_HOOK = join(__dirname, "..", "..", "scripts", "validate-cloud-bash.cjs");
const HOOK_SETTINGS = JSON.stringify({
  hooks: {
    PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: `node "${BASH_VALIDATOR_HOOK}"` }] }],
  },
});

export function registerRunCloudClaudeTask(server: McpServer) {
  server.tool(
    "run_cloud_claude_task",
    "Runs a task end-to-end via `ollama launch claude` (the full Claude Code harness) against a free Ollama cloud " +
      "model, restricted to git status/diff/log/add/commit/show plus Read/Glob/Grep. Verify the result yourself " +
      "afterward - don't trust its own report. Requires CLOUD_CLAUDE_ENABLED=1, an 'ollama signin', and the " +
      "'ollama launch claude' feature installed.",
    {
      task: z.string().describe("The task to perform, phrased explicitly (e.g. 'run this exact command yourself, do not delegate')."),
      cwd: z.string().optional().describe("Working directory to run in. Defaults to the MCP server's own cwd."),
      model: z.string().default("nemotron-3-super:cloud").describe("An Ollama cloud model tag (*:cloud). Use list_ollama_models to see what's signed in."),
    },
    async ({ task, cwd, model }) => {
      const result = spawnSync(
        "ollama",
        [
          "launch",
          "claude",
          "--model",
          model,
          "--yes",
          "--",
          "-p",
          task,
          "--max-turns",
          "8",
          "--system-prompt",
          CLAUDE_SYSTEM_PROMPT,
          "--allowedTools",
          ALLOWED_TOOLS_FLAG,
          "--settings",
          HOOK_SETTINGS,
        ],
        { cwd: cwd || process.cwd(), encoding: "utf8", timeout: SPAWN_TIMEOUT_MS }
      );

      if (result.error) {
        return { isError: true, content: [{ type: "text", text: `Failed to run 'ollama launch claude': ${result.error.message}` }] };
      }
      if (result.status !== 0) {
        return { isError: true, content: [{ type: "text", text: `Exited ${result.status}: ${result.stderr || result.stdout}` }] };
      }
      return { content: [{ type: "text", text: result.stdout || "(no output)" }] };
    }
  );
}
