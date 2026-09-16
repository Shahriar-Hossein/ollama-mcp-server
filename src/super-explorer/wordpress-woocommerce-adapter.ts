import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import TypeScript from "tree-sitter-typescript";
import {
  ADAPTER_SCHEMA_VERSION,
  type AdapterFact,
  type AdapterIndex,
  type FrameworkAdapter,
  type FrameworkAdapterContext,
} from "./framework-adapter.js";
import type { ResolutionQuality, SourcePosition, SourceRange, SymbolRecord } from "./indexer.js";

const REGISTRATION_FUNCTIONS = new Set(["add_action", "add_filter"]);
const EMITTER_FUNCTIONS = new Set(["do_action", "do_action_ref_array", "apply_filters", "apply_filters_ref_array"]);

function parserFor(file: string): Parser {
  const parser = new Parser();
  parser.setLanguage(file.endsWith(".tsx") ? TypeScript.tsx : file.endsWith(".ts") ? TypeScript.typescript : JavaScript);
  return parser;
}

function position(node: Parser.SyntaxNode, edge: "start" | "end"): SourcePosition {
  const point = edge === "start" ? node.startPosition : node.endPosition;
  return { line: point.row + 1, column: point.column + 1, byte: edge === "start" ? node.startIndex : node.endIndex };
}

function range(node: Parser.SyntaxNode): SourceRange {
  return { start: position(node, "start"), end: position(node, "end") };
}

function literalString(node: Parser.SyntaxNode | undefined): string | null {
  if (!node || (node.type !== "string" && node.type !== "template_string")) return null;
  const text = node.text;
  if (text.length < 2 || (node.type === "template_string" && text.includes("${"))) return null;
  return text.slice(1, -1);
}

function containingSymbol(symbols: SymbolRecord[], node: Parser.SyntaxNode): SymbolRecord | null {
  let containing: SymbolRecord | null = null;
  for (const symbol of symbols) {
    if (symbol.range.start.byte <= node.startIndex && node.endIndex <= symbol.range.end.byte
      && (!containing || symbol.range.start.byte >= containing.range.start.byte)) {
      containing = symbol;
    }
  }
  return containing;
}

function functionName(node: Parser.SyntaxNode | null): string | null {
  return node?.type === "identifier" ? node.text : null;
}

function hookFact(
  file: string,
  symbols: SymbolRecord[],
  call: Parser.SyntaxNode,
  name: string,
): AdapterFact {
  const argumentsNode = call.childForFieldName("arguments");
  const hook = literalString(argumentsNode?.namedChildren[0]);
  const registration = REGISTRATION_FUNCTIONS.has(name);
  const callback = registration ? argumentsNode?.namedChildren[1] : undefined;
  const containing = containingSymbol(symbols, call);
  const resolution: ResolutionQuality = hook === null ? "unresolved" : "exact";
  return {
    schema_version: ADAPTER_SCHEMA_VERSION,
    kind: registration ? "hook_registration" : "hook_emitter",
    file,
    range: range(call),
    containing_symbol_id: containing?.id ?? null,
    resolution,
    attributes: {
      hook_name: hook,
      hook_kind: name.includes("filter") ? "filter" : "action",
      invocation: name,
      ...(callback ? { callback: callback.text } : {}),
    },
  };
}

function extractFileFacts(file: string, source: string, symbols: SymbolRecord[]): AdapterFact[] {
  const facts: AdapterFact[] = [];
  const tree = parserFor(file).parse(source);
  const visit = (node: Parser.SyntaxNode): void => {
    if (node.type === "call_expression") {
      const name = functionName(node.childForFieldName("function"));
      if (name && (REGISTRATION_FUNCTIONS.has(name) || EMITTER_FUNCTIONS.has(name))) {
        facts.push(hookFact(file, symbols, node, name));
      }
    }
    for (const child of node.namedChildren) visit(child);
  };
  visit(tree.rootNode);
  return facts;
}

/** Extracts literal WordPress/WooCommerce hook registrations and emitters from indexed JS/TS source. */
export const wordpressWooCommerceAdapter: FrameworkAdapter = {
  name: "wordpress-woocommerce",
  supports(context: FrameworkAdapterContext): boolean {
    return context.index.calls.some((call) => REGISTRATION_FUNCTIONS.has(call.callee_name) || EMITTER_FUNCTIONS.has(call.callee_name));
  },
  extract(context: FrameworkAdapterContext): AdapterIndex {
    const facts: AdapterFact[] = [];
    const files = new Set(context.index.calls
      .filter((call) => REGISTRATION_FUNCTIONS.has(call.callee_name) || EMITTER_FUNCTIONS.has(call.callee_name))
      .map((call) => call.file));
    for (const file of files) {
      const source = readFileSync(resolve(context.repository_root, file), "utf8");
      facts.push(...extractFileFacts(file, source, context.index.symbols.filter((symbol) => symbol.file === file)));
    }
    return { schema_version: ADAPTER_SCHEMA_VERSION, adapter: "wordpress-woocommerce", commit_hash: context.index.commit_hash, facts };
  },
};
