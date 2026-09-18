// Shared between run-local-worker-task and run-cloud-claude-task so the two
// agentic tools can't drift into different safety guarantees. Mirrors
// ~/.local/bin/local-worker and ~/.local/bin/local-claude's allowlists,
// validated in docs/planning/local-claude-worker-experiment.md.
export const ALLOWLIST_DESCRIPTION = "git status/diff/log/add/commit/show only";

const ALLOWED_SUBCOMMANDS = ["status", "diff", "log", "add", "commit", "show"];

// Bare regex prefix-matching a command string (e.g. /^git commit(\s|$)/) is not
// safe on its own: "git commit -m x && rm -rf /" still starts with "git commit".
// Reject shell metacharacters outright and tokenize so callers can exec the
// parsed argv directly (no shell), which is what actually closes the hole.
const SHELL_METACHARACTERS = /[;&|`\n<>]|\$\(/;

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command))) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  return tokens;
}

// Returns the parsed argv (["git", "commit", "-m", "msg"]) if `command` is
// exactly one allowed git invocation, or null if it isn't - including any
// attempt to chain, substitute, or wrap it (bash -c, git -c, absolute paths).
export function parseAllowedGitCommand(command: string): string[] | null {
  if (SHELL_METACHARACTERS.test(command)) return null;
  const tokens = tokenize(command.trim());
  if (tokens[0] !== "git") return null;
  if (!ALLOWED_SUBCOMMANDS.includes(tokens[1])) return null;
  return tokens;
}

export function isAllowedCommand(command: string): boolean {
  return parseAllowedGitCommand(command) !== null;
}

// For local-claude's --allowedTools flag, which takes Bash(<pattern>:*) entries.
export const ALLOWED_TOOLS_FLAG =
  "Read,Glob,Grep,Bash(git status:*),Bash(git diff:*),Bash(git log:*),Bash(git add:*),Bash(git commit:*),Bash(git show:*)";

export const WORKER_SYSTEM_PROMPT = `You are a small local coding worker with one tool: bash.

Rules:
- Work only in the current directory.
- Use the minimum number of tool calls to finish the task.
- Never push to a remote repository.
- Never use destructive git commands (reset --hard, clean -fd, etc).
- When the task is done, reply with plain text and no further tool calls.`;

export const CLAUDE_SYSTEM_PROMPT = `You are a small coding worker.

Perform only the task given to you.

Rules:
- Work only in the current working directory.
- Do not explore unrelated files.
- Prefer the minimum number of tool calls.
- Do not redesign or refactor unless explicitly requested.
- Do not ask follow-up questions for straightforward tasks.
- Never push to a remote repository.
- Never use destructive git commands such as reset --hard or clean -fd.
- When finished, briefly report what you did.`;
