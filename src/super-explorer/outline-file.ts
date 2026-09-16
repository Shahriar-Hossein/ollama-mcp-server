import { relative, resolve, sep } from "node:path";
import { indexRepository, type RepositoryIndex, type SourceRange, type SymbolKind } from "./indexer.js";

export interface OutlineSymbol {
  id: string;
  kind: SymbolKind;
  name: string;
  qualified_name: string;
  range: SourceRange;
  selection_range: SourceRange;
  signature: string;
  children: OutlineSymbol[];
}

export interface FileOutline {
  commit_hash: string;
  file: string;
  symbols: OutlineSymbol[];
}

function repositoryPath(repositoryRoot: string, path: string): string {
  if (!path.trim()) throw new Error("Path must not be empty.");

  const root = resolve(repositoryRoot);
  const candidate = resolve(root, path);
  const relativePath = relative(root, candidate);
  if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    throw new Error(`Path must be a file within the repository: ${path}`);
  }
  return relativePath.split(sep).join("/");
}

export function outlineFile(repositoryRoot: string, path: string, index: RepositoryIndex = indexRepository(repositoryRoot)): FileOutline {
  const file = repositoryPath(repositoryRoot, path);
  const symbols = index.symbols.filter((symbol) => symbol.file === file);
  const symbolIds = new Set(symbols.map((symbol) => symbol.id));
  const childrenByParent = new Map<string, OutlineSymbol[]>();
  const topLevel: OutlineSymbol[] = [];

  for (const symbol of symbols) {
    const outlineSymbol: OutlineSymbol = {
      id: symbol.id,
      kind: symbol.kind,
      name: symbol.name,
      qualified_name: symbol.qualified_name,
      range: symbol.range,
      selection_range: symbol.selection_range,
      signature: symbol.signature,
      children: [],
    };
    if (symbol.parent_id && symbolIds.has(symbol.parent_id)) {
      const siblings = childrenByParent.get(symbol.parent_id) ?? [];
      siblings.push(outlineSymbol);
      childrenByParent.set(symbol.parent_id, siblings);
    } else {
      topLevel.push(outlineSymbol);
    }
    childrenByParent.set(symbol.id, outlineSymbol.children);
  }

  return { commit_hash: index.commit_hash, file, symbols: topLevel };
}
