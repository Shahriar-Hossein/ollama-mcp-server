import type { RepositoryIndex, ResolutionQuality, SourceRange } from "../../explorer/indexer.js";

export const ADAPTER_SCHEMA_VERSION = 1;

/** A source-derived framework fact, namespaced by the adapter that extracted it. */
export interface AdapterFact {
  schema_version: typeof ADAPTER_SCHEMA_VERSION;
  kind: string;
  file: string;
  range: SourceRange;
  containing_symbol_id: string | null;
  resolution: ResolutionQuality;
  attributes: Record<string, unknown>;
}

export interface FrameworkAdapterContext {
  repository_root: string;
  index: RepositoryIndex;
}

export interface AdapterIndex {
  schema_version: typeof ADAPTER_SCHEMA_VERSION;
  adapter: string;
  commit_hash: string;
  facts: AdapterFact[];
}

/**
 * Extends a completed generic index with framework-specific source facts.
 * Adapters must not mutate the generic index or claim relationships not
 * represented by their returned facts.
 */
export interface FrameworkAdapter {
  name: string;
  supports(context: FrameworkAdapterContext): boolean;
  extract(context: FrameworkAdapterContext): AdapterIndex;
}

/** Runs an adapter and rejects output that does not describe the indexed checkout. */
export function extractAdapterFacts(adapter: FrameworkAdapter, context: FrameworkAdapterContext): AdapterIndex | null {
  if (!adapter.supports(context)) return null;

  const result = adapter.extract(context);
  if (result.schema_version !== ADAPTER_SCHEMA_VERSION) {
    throw new Error(`Unsupported adapter index schema version: ${result.schema_version}`);
  }
  if (result.adapter !== adapter.name) {
    throw new Error(`Adapter result name ${result.adapter} does not match ${adapter.name}`);
  }
  if (result.commit_hash !== context.index.commit_hash) {
    throw new Error("Adapter facts must describe the same commit as the generic index.");
  }
  return result;
}
