export interface Features {
  semanticSearch: boolean;
  gitHistory: boolean;
  knowledgeStore: boolean;
  verificationPipeline: boolean;
  fullExplorer: boolean;
  localExplorerTask: boolean;
  frameworkAdapters: boolean;
  localWorker: boolean;
  cloudClaudeWorker: boolean;
}

type Environment = Record<string, string | undefined>;

function optionalFlag(environment: Environment, name: string): boolean | undefined {
  const value = environment[name]?.trim().toLowerCase();
  if (value === undefined || value === "") return undefined;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  throw new Error(`${name} must be one of: 1, 0, true, false, yes, no, on, off.`);
}

function autonomousFlag(environment: Environment, name: string): boolean {
  const value = environment[name]?.trim();
  if (value === undefined || value === "" || value === "0") return false;
  if (value === "1") return true;
  throw new Error(`${name} must be 1 or 0.`);
}

export function loadFeatures(environment: Environment = process.env): Features {
  const experimental = optionalFlag(environment, "ENABLE_EXPERIMENTAL") ?? false;
  const experimentalFeature = (name: string) => optionalFlag(environment, name) ?? experimental;
  const features: Features = {
    semanticSearch: experimentalFeature("ENABLE_SEMANTIC_SEARCH"),
    gitHistory: experimentalFeature("ENABLE_GIT_HISTORY"),
    knowledgeStore: experimentalFeature("ENABLE_KNOWLEDGE_STORE"),
    verificationPipeline: experimentalFeature("ENABLE_VERIFICATION_PIPELINE"),
    fullExplorer: experimentalFeature("ENABLE_FULL_EXPLORER"),
    localExplorerTask: experimentalFeature("ENABLE_LOCAL_EXPLORER_TASK"),
    frameworkAdapters: experimentalFeature("ENABLE_FRAMEWORK_ADAPTERS"),
    localWorker: autonomousFlag(environment, "LOCAL_WORKER_ENABLED"),
    cloudClaudeWorker: autonomousFlag(environment, "CLOUD_CLAUDE_ENABLED"),
  };

  if (features.fullExplorer && !features.verificationPipeline) {
    throw new Error("ENABLE_FULL_EXPLORER requires ENABLE_VERIFICATION_PIPELINE.");
  }
  return features;
}
