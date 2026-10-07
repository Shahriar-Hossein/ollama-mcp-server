import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { parseAllowedGitCommand } from "./shell-allowlist.js";

const HOOK = new URL("../../../scripts/validate-cloud-bash.cjs", import.meta.url).pathname;

const allowed = [
  "git status",
  "git status --short --branch",
  "git status --porcelain=v2",
  "git diff",
  "git diff --cached --stat",
  "git diff -U5 -- src/a.ts",
  "git diff HEAD~1..HEAD --name-only",
  "git log --oneline -n 5",
  "git log -5 --stat",
  "git log --pretty=short",
  "git show HEAD",
  "git show HEAD --stat",
  "git add src/a.ts",
  "git add -A",
  "git add -- src/a.ts",
  'git commit -m "fix: x"',
  'git commit -am "fix: x"',
  "git commit --message=fix",
  'git commit -m "see http://a/b ../c"',
  "git commit --allow-empty -m wip",
];

const blocked = [
  "git diff --output=/tmp/x",
  "git diff --output /tmp/x",
  "git diff --ext-diff",
  "git diff --no-index /etc/passwd /etc/hosts",
  "git commit --amend --no-edit",
  'git commit --amend -m "x"',
  'git commit --no-verify -m "x"',
  "git commit -F /etc/passwd",
  "git commit --file=x",
  "git log --all",
  "git log --format=%H",
  "git log --output=x",
  "git show HEAD:/etc/passwd",
  "git add /etc/passwd",
  "git add ../other",
  "git add ~/x",
  "git diff -- ../x",
  "git -c core.editor=vim commit",
  "git commit -m x && rm -rf /",
  "git status; ls",
  "bash -c 'git status'",
  "/usr/bin/git status",
  "git push",
  "git commit -m",
  "git log -n",
];

const hook = (command: string) =>
  spawnSync("node", [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
  }).status;

test("allows plain read and commit invocations", () => {
  for (const command of allowed) {
    assert.ok(parseAllowedGitCommand(command), `TS rejected: ${command}`);
    assert.equal(hook(command), 0, `hook rejected: ${command}`);
  }
});

test("blocks unsafe flags, escaping paths, chaining and wrapping", () => {
  for (const command of blocked) {
    assert.equal(parseAllowedGitCommand(command), null, `TS allowed: ${command}`);
    assert.equal(hook(command), 2, `hook allowed: ${command}`);
  }
});

test("hook fails closed on malformed input and ignores other tools", () => {
  assert.equal(spawnSync("node", [HOOK], { input: "{not json" }).status, 2);
  assert.equal(spawnSync("node", [HOOK], { input: "" }).status, 2);
  const read = JSON.stringify({ tool_name: "Read", tool_input: { file_path: "x" } });
  assert.equal(spawnSync("node", [HOOK], { input: read }).status, 0);
});
