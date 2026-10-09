import { readFileSync } from "node:fs";
import Parser from "tree-sitter";
import Python from "tree-sitter-python";
import { parseSource } from "../../src/explorer/parse.js";
import { checkedFile, MAX_CONTEXT_CHARS } from "../../src/experimental/tools/local-explore-packing.js";
import type { EvidenceLine } from "./scope-answer-context.js";
import { foreignOwnerCitations, type Location, type OwnedCitation } from "./citation-owner-check.js";

const SCOPES = new Set(["function_definition", "class_definition", "lambda"]);
const MAX_REFS = 96;
const MAX_FILES = 6;
type CheckedSource = { source: string; lines: string[]; tree?: Parser.Tree; starts?: Map<number, Parser.SyntaxNode[]> };
const location = (ref: EvidenceLine): Location => ({ file: ref.file, line: ref.line });

export function pythonCitationOwners(root: string, refs: readonly EvidenceLine[]): OwnedCitation[] {
  if (refs.length > MAX_REFS) throw new Error("Too many citation positions");
  const sources = new Map<string, CheckedSource>();
  let chars = 0;
  for (const ref of refs) {
    if (!ref.file.endsWith(".py") || ref.file.startsWith("/") || ref.file.includes("\\") ||
        ref.file.split("/").some(part => !part || part === "." || part === "..") ||
        !Number.isSafeInteger(ref.line) || ref.line < 1 || !ref.quote.trim())
      throw new Error("Invalid Python citation reference");
    if (!sources.has(ref.file)) {
      if (sources.size >= MAX_FILES) throw new Error("Too many Python source files");
      const source = readFileSync(checkedFile(root, ref.file), "utf8");
      chars += source.length;
      if (chars > MAX_CONTEXT_CHARS) throw new Error("Python source context exceeds character cap");
      sources.set(ref.file, { source, lines: source.split("\n") });
    }
    if (sources.get(ref.file)?.lines[ref.line - 1]?.trim() !== ref.quote.trim())
      throw new Error(`Citation quote differs from checked source: ${ref.file}:${ref.line}`);
  }
  const parser = new Parser();
  parser.setLanguage(Python);
  for (const source of sources.values()) {
    source.tree = parseSource(parser, source.source);
    source.starts = new Map();
    const visit = (node: Parser.SyntaxNode) => {
      if (SCOPES.has(node.type)) {
        const row = node.startPosition.row;
        const scopes = source.starts!.get(row) ?? [];
        scopes.push(node);
        source.starts!.set(row, scopes);
      }
      for (const child of node.namedChildren) visit(child);
    };
    if (!source.tree.rootNode.hasError) visit(source.tree.rootNode);
  }
  return refs.map(ref => {
    const checked = sources.get(ref.file)!;
    const rootNode = checked.tree!.rootNode;
    let owner: Location | null = null;
    if (!rootNode.hasError) {
      const row = ref.line - 1;
      const starts = checked.starts!.get(row) ?? [];
      if (starts.length === 1 && starts[0].type === "function_definition") {
        owner = location(ref);
      } else if (starts.length === 0) {
        const column = checked.lines[row].search(/\S/);
        if (column >= 0) {
          for (let node: Parser.SyntaxNode | null = rootNode.descendantForPosition({ row, column }); node; node = node.parent) {
            if (!SCOPES.has(node.type)) continue;
            if (node.type === "function_definition" && !node.hasError)
              owner = { file: ref.file, line: node.startPosition.row + 1 };
            break;
          }
        }
      }
    }
    return { citation: location(ref), owner };
  });
}

export type PythonCitationReview = {
  status: "needs_review";
  requested_target: Location | null;
  resolved_target: Location | null;
  owners: OwnedCitation[];
  foreign_owner_citations: Location[];
  unresolved_citations: Location[];
  reasons: ("no_citations" | "unresolved_target" | "unknown_owners")[];
};
export function reviewPythonCitations(
  root: string, target: EvidenceLine | null, refs: readonly EvidenceLine[],
): PythonCitationReview {
  const checked = pythonCitationOwners(root, target ? [target, ...refs] : refs);
  const targetOwner = target ? checked.shift()!.owner : null;
  const resolved = target && targetOwner?.file === target.file && targetOwner.line === target.line
    ? targetOwner : null;
  const unresolved = new Map<string, Location>();
  for (const item of checked) {
    if (!resolved || !item.owner)
      unresolved.set(JSON.stringify([item.citation.file, item.citation.line]), { ...item.citation });
  }
  const reasons: PythonCitationReview["reasons"] = [];
  if (!refs.length) reasons.push("no_citations");
  if (!resolved) reasons.push("unresolved_target");
  if (checked.some(item => !item.owner)) reasons.push("unknown_owners");
  return {
    status: "needs_review", requested_target: target ? location(target) : null,
    resolved_target: resolved ? { ...resolved } : null, owners: checked,
    foreign_owner_citations: foreignOwnerCitations(resolved, checked),
    unresolved_citations: [...unresolved.values()], reasons,
  };
}
