import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFeatures } from "./features.js";

test("lean features are the default and autonomous workers stay independent", () => {
  assert.deepEqual(loadFeatures({}), {
    semanticSearch: false,
    gitHistory: false,
    knowledgeStore: false,
    verificationPipeline: false,
    fullExplorer: false,
    localExplorerTask: false,
    frameworkAdapters: false,
    localWorker: false,
    cloudClaudeWorker: false,
  });
  assert.equal(loadFeatures({ ENABLE_EXPERIMENTAL: "1" }).localWorker, false);
  assert.equal(loadFeatures({ ENABLE_EXPERIMENTAL: "1" }).cloudClaudeWorker, false);
});

test("experimental features can be enabled together or overridden individually", () => {
  const all = loadFeatures({ ENABLE_EXPERIMENTAL: "true" });
  assert.equal(all.semanticSearch, true);
  assert.equal(all.gitHistory, true);
  assert.equal(all.knowledgeStore, true);
  assert.equal(all.verificationPipeline, true);
  assert.equal(all.fullExplorer, true);
  assert.equal(all.localExplorerTask, true);
  assert.equal(all.frameworkAdapters, true);
  assert.equal(loadFeatures({ ENABLE_EXPERIMENTAL: "1", ENABLE_KNOWLEDGE_STORE: "0" }).knowledgeStore, false);
});

test("feature flags are validated and dependencies fail at startup", () => {
  assert.throws(() => loadFeatures({ ENABLE_SEMANTIC_SEARCH: "sometimes" }), /ENABLE_SEMANTIC_SEARCH/);
  assert.throws(() => loadFeatures({ ENABLE_FULL_EXPLORER: "1" }), /requires ENABLE_VERIFICATION_PIPELINE/);
  assert.equal(loadFeatures({ ENABLE_FULL_EXPLORER: "1", ENABLE_VERIFICATION_PIPELINE: "1" }).fullExplorer, true);
  assert.equal(loadFeatures({ LOCAL_WORKER_ENABLED: "1", CLOUD_CLAUDE_ENABLED: "1" }).localWorker, true);
  assert.throws(() => loadFeatures({ LOCAL_WORKER_ENABLED: "true" }), /LOCAL_WORKER_ENABLED must be 1 or 0/);
});
