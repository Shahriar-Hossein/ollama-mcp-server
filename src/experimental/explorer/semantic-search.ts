import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { embed } from "../../ollama-client.js";
import { indexRepository, type SymbolRecord } from "../../explorer/indexer.js";

const SEMANTIC_INDEX_VERSION = 2;
const DEFAULT_EMBEDDING_MODEL = process.env.SUPER_EXPLORER_EMBEDDING_MODEL || "nomic-embed-text-v2-moe";
const EMBEDDING_BATCH_SIZE = 128;
const MAX_EMBEDDING_TEXT_CHARS = 1_600;

interface SemanticEntry {
  symbol_id: string;
  file: string;
  qualified_name: string;
  kind: SymbolRecord["kind"];
  range: SymbolRecord["range"];
  text: string;
  embedding: number[];
}

interface SemanticIndex {
  version: typeof SEMANTIC_INDEX_VERSION;
  commit_hash: string;
  model: string;
  dimensions: number;
  entries: SemanticEntry[];
}

export interface SemanticSearchResult {
  commit_hash: string;
  model: string;
  query: string;
  results: Array<{
    score: number;
    symbol: Pick<SymbolRecord, "id" | "file" | "qualified_name" | "kind" | "range">;
  }>;
}

function sidecarPath(root: string, model: string): string {
  const safeModel = model.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
  return resolve(root, ".super-explorer", "embeddings", `${safeModel}.json`);
}

function sourceForSymbol(root: string, symbol: SymbolRecord): string {
  const source = readFileSync(resolve(root, symbol.file));
  const prefix = source.subarray(0, symbol.range.start.byte).toString("utf8");
  const docblock = prefix.match(/\/\*\*[\s\S]*?\*\/\s*$/)?.[0] ?? "";
  const body = source.subarray(symbol.range.start.byte, symbol.range.end.byte).toString("utf8");
  return `${symbol.kind} ${symbol.qualified_name}\n${symbol.signature}\n${docblock}${body}`.slice(0, MAX_EMBEDDING_TEXT_CHARS);
}

function embeddingInput(model: string, role: "query" | "document", text: string): string {
  return model.startsWith("nomic-embed-text-v2-moe") ? `search_${role}: ${text}` : text;
}

function normalize(vector: number[]): number[] {
  if (!vector.every(Number.isFinite)) throw new Error("Ollama returned a non-finite embedding value.");
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) throw new Error("Ollama returned a zero-length embedding.");
  return vector.map((value) => value / magnitude);
}

function validIndex(value: unknown, commitHash: string, model: string): value is SemanticIndex {
  if (!value || typeof value !== "object") return false;
  const index = value as Partial<SemanticIndex>;
  return index.version === SEMANTIC_INDEX_VERSION
    && index.commit_hash === commitHash
    && index.model === model
    && typeof index.dimensions === "number"
    && Array.isArray(index.entries)
    && index.entries.every((entry) => Array.isArray(entry.embedding) && entry.embedding.length === index.dimensions);
}

function readReusableIndex(root: string, commitHash: string, model: string): SemanticIndex | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(sidecarPath(root, model), "utf8"));
    return validIndex(parsed, commitHash, model) ? parsed : null;
  } catch (error: any) {
    if (error.code === "ENOENT") return null;
    throw new Error(`Could not read semantic index: ${error.message}`);
  }
}

async function embedAll(model: string, texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = await embed(model, texts.slice(start, start + EMBEDDING_BATCH_SIZE));
    if (batch.length !== Math.min(EMBEDDING_BATCH_SIZE, texts.length - start)) {
      throw new Error(`Ollama returned ${batch.length} embeddings for a batch of ${Math.min(EMBEDDING_BATCH_SIZE, texts.length - start)} inputs.`);
    }
    vectors.push(...batch.map(normalize));
  }
  return vectors;
}

/** Builds a model-specific, commit-pinned symbol embedding sidecar. */
export async function buildSemanticIndex(repositoryRoot: string, model = DEFAULT_EMBEDDING_MODEL): Promise<Pick<SemanticIndex, "commit_hash" | "model" | "dimensions"> & { entries_indexed: number }> {
  const root = resolve(repositoryRoot);
  const index = indexRepository(root);
  const reusable = readReusableIndex(root, index.commit_hash, model);
  if (reusable) return { commit_hash: reusable.commit_hash, model: reusable.model, dimensions: reusable.dimensions, entries_indexed: reusable.entries.length };

  const symbols = index.symbols;
  const texts = symbols.map((symbol) => embeddingInput(model, "document", sourceForSymbol(root, symbol)));
  const vectors = await embedAll(model, texts);
  const dimensions = vectors[0]?.length ?? 0;
  if (!dimensions || vectors.some((vector) => vector.length !== dimensions)) throw new Error("Ollama returned embeddings with inconsistent dimensions.");
  const semanticIndex: SemanticIndex = {
    version: SEMANTIC_INDEX_VERSION,
    commit_hash: index.commit_hash,
    model,
    dimensions,
    entries: symbols.map((symbol, offset) => ({
      symbol_id: symbol.id,
      file: symbol.file,
      qualified_name: symbol.qualified_name,
      kind: symbol.kind,
      range: symbol.range,
      text: texts[offset],
      embedding: vectors[offset],
    })),
  };
  const output = sidecarPath(root, model);
  mkdirSync(resolve(root, ".super-explorer", "embeddings"), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(semanticIndex));
  renameSync(temporary, output);
  return { commit_hash: semanticIndex.commit_hash, model, dimensions, entries_indexed: semanticIndex.entries.length };
}

/** Finds declarations whose source, signature, or immediately preceding docblock is closest to the query. */
export async function semanticSearch(repositoryRoot: string, query: string, limit = 10, model = DEFAULT_EMBEDDING_MODEL): Promise<SemanticSearchResult> {
  const root = resolve(repositoryRoot);
  const trimmedQuery = query.trim();
  if (!trimmedQuery) throw new Error("Semantic query must not be empty.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Semantic result limit must be an integer from 1 through 100.");
  const index = indexRepository(root);
  const semanticIndex = readReusableIndex(root, index.commit_hash, model);
  if (!semanticIndex) await buildSemanticIndex(root, model);
  const current = readReusableIndex(root, index.commit_hash, model);
  if (!current) throw new Error("Semantic index was not available after indexing.");
  const [queryVector] = await embedAll(model, [embeddingInput(model, "query", trimmedQuery)]);
  if (queryVector.length !== current.dimensions) throw new Error("Query embedding dimensions do not match the stored semantic index.");
  return {
    commit_hash: current.commit_hash,
    model,
    query: trimmedQuery,
    results: current.entries
      .map((entry) => ({
        score: entry.embedding.reduce((sum, value, offset) => sum + value * queryVector[offset], 0),
        symbol: { id: entry.symbol_id, file: entry.file, qualified_name: entry.qualified_name, kind: entry.kind, range: entry.range },
      }))
      .sort((left, right) => right.score - left.score || left.symbol.file.localeCompare(right.symbol.file) || left.symbol.range.start.byte - right.symbol.range.start.byte)
      .slice(0, limit),
  };
}
