#!/usr/bin/env node
// PreToolUse hook for run_cloud_claude_task's `ollama launch claude` subprocess.
//
// --allowedTools splits compound commands (&&/;/|) and checks each part, but
// per Claude Code's own docs that's not a security boundary: it doesn't catch
// wrapping (bash -c '...'), git flag injection (git -c core.editor=...), or
// absolute-path invocation. This hook re-validates the raw command text
// independently of --allowedTools. Keep the allowed-subcommand list in sync
// with src/experimental/workers/shell-allowlist.ts.
const ALLOWED_SUBCOMMANDS = ["status", "diff", "log", "add", "commit", "show"];
const SHELL_METACHARACTERS = /[;&|`\n<>]|\$\(/;

function tokenize(command) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(command))) tokens.push(m[1] ?? m[2] ?? m[3]);
  return tokens;
}

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0); // unparseable - defer to the primary --allowedTools gate
  }

  if (data.tool_name !== "Bash") process.exit(0);

  const command = String(data.tool_input?.command || "");
  const tokens = tokenize(command.trim());
  const ok = !SHELL_METACHARACTERS.test(command) && tokens[0] === "git" && ALLOWED_SUBCOMMANDS.includes(tokens[1]);

  if (!ok) {
    console.error(`Blocked: "${command}" is not an allowed git command, or uses shell chaining/wrapping.`);
    process.exit(2); // exit 2 = block; stderr is surfaced to the model as the reason
  }
  process.exit(0);
});
