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
import type { ResolutionQuality, SourcePosition, SourceRange, SymbolRecord } from "../../explorer/indexer.js";

const REGISTRATION_FUNCTIONS = new Set(["add_action", "add_filter"]);
const EMITTER_FUNCTIONS = new Set(["do_action", "do_action_ref_array", "apply_filters", "apply_filters_ref_array"]);
const META_READ_FUNCTIONS = new Map([
  ["get_post_meta", "post"],
  ["get_user_meta", "user"],
  ["get_comment_meta", "comment"],
  ["get_term_meta", "term"],
  ["get_metadata", null],
]);
const META_WRITE_FUNCTIONS = new Map([
  ["add_post_meta", "post"],
  ["update_post_meta", "post"],
  ["delete_post_meta", "post"],
  ["add_user_meta", "user"],
  ["update_user_meta", "user"],
  ["delete_user_meta", "user"],
  ["add_comment_meta", "comment"],
  ["update_comment_meta", "comment"],
  ["delete_comment_meta", "comment"],
  ["add_term_meta", "term"],
  ["update_term_meta", "term"],
  ["delete_term_meta", "term"],
  ["add_metadata", null],
  ["update_metadata", null],
  ["delete_metadata", null],
]);
const OPTION_READ_FUNCTIONS = new Set(["get_option", "get_site_option", "get_network_option"]);
const OPTION_WRITE_FUNCTIONS = new Set([
  "add_option", "update_option", "delete_option",
  "add_site_option", "update_site_option", "delete_site_option",
  "add_network_option", "update_network_option", "delete_network_option",
]);
const REST_ROUTE_FUNCTION = "register_rest_route";
const SHORTCODE_FUNCTION = "add_shortcode";
const PRICE_MUTATION_METHODS = new Set(["set_price", "set_regular_price", "set_sale_price"]);
const CART_HOOKS = new Set([
  "woocommerce_before_calculate_totals",
  "woocommerce_add_to_cart",
  "woocommerce_cart_updated",
  "woocommerce_cart_item_removed",
]);

function isAjaxHook(hook: string | null): boolean {
  return hook?.startsWith("wp_ajax_") ?? false;
}

function isCartHook(hook: string | null): boolean {
  return hook !== null && (CART_HOOKS.has(hook) || (hook.startsWith("woocommerce_") && hook.includes("cart")));
}

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

function methodName(node: Parser.SyntaxNode | null): string | null {
  if (node?.type !== "member_expression") return null;
  const property = node.childForFieldName("property");
  return property?.type === "property_identifier" ? property.text : null;
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

function metadataFact(file: string, symbols: SymbolRecord[], call: Parser.SyntaxNode, name: string): AdapterFact {
  const argumentsNode = call.childForFieldName("arguments");
  const generic = name.endsWith("metadata");
  const key = literalString(argumentsNode?.namedChildren[generic ? 2 : 1]);
  const metaType = generic ? literalString(argumentsNode?.namedChildren[0]) : META_READ_FUNCTIONS.get(name) ?? META_WRITE_FUNCTIONS.get(name);
  const containing = containingSymbol(symbols, call);
  return {
    schema_version: ADAPTER_SCHEMA_VERSION,
    kind: META_READ_FUNCTIONS.has(name) ? "metadata_read" : "metadata_write",
    file,
    range: range(call),
    containing_symbol_id: containing?.id ?? null,
    resolution: key === null ? "unresolved" : "exact",
    attributes: { api: name, meta_type: metaType, meta_key: key },
  };
}

function optionFact(file: string, symbols: SymbolRecord[], call: Parser.SyntaxNode, name: string): AdapterFact {
  const option = literalString(call.childForFieldName("arguments")?.namedChildren[0]);
  const containing = containingSymbol(symbols, call);
  return {
    schema_version: ADAPTER_SCHEMA_VERSION,
    kind: OPTION_READ_FUNCTIONS.has(name) ? "option_read" : "option_write",
    file,
    range: range(call),
    containing_symbol_id: containing?.id ?? null,
    resolution: option === null ? "unresolved" : "exact",
    attributes: { api: name, option_name: option },
  };
}

function restRouteFact(file: string, symbols: SymbolRecord[], call: Parser.SyntaxNode): AdapterFact {
  const argumentsNode = call.childForFieldName("arguments");
  const namespace = literalString(argumentsNode?.namedChildren[0]);
  const route = literalString(argumentsNode?.namedChildren[1]);
  const containing = containingSymbol(symbols, call);
  return {
    schema_version: ADAPTER_SCHEMA_VERSION,
    kind: "rest_route",
    file,
    range: range(call),
    containing_symbol_id: containing?.id ?? null,
    resolution: namespace !== null && route !== null ? "exact" : "unresolved",
    attributes: { api: REST_ROUTE_FUNCTION, namespace, route },
  };
}

function shortcodeFact(file: string, symbols: SymbolRecord[], call: Parser.SyntaxNode): AdapterFact {
  const argumentsNode = call.childForFieldName("arguments");
  const shortcode = literalString(argumentsNode?.namedChildren[0]);
  const callback = argumentsNode?.namedChildren[1];
  const containing = containingSymbol(symbols, call);
  return {
    schema_version: ADAPTER_SCHEMA_VERSION,
    kind: "shortcode_registration",
    file,
    range: range(call),
    containing_symbol_id: containing?.id ?? null,
    resolution: shortcode === null ? "unresolved" : "exact",
    attributes: { api: SHORTCODE_FUNCTION, shortcode, ...(callback ? { callback: callback.text } : {}) },
  };
}

function priceMutationFact(file: string, symbols: SymbolRecord[], call: Parser.SyntaxNode, method: string): AdapterFact {
  const functionNode = call.childForFieldName("function");
  const receiver = functionNode?.childForFieldName("object");
  const containing = containingSymbol(symbols, call);
  return {
    schema_version: ADAPTER_SCHEMA_VERSION,
    kind: "wc_price_mutation",
    file,
    range: range(call),
    containing_symbol_id: containing?.id ?? null,
    resolution: "static",
    attributes: { api: method, receiver: receiver?.text ?? null },
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
      if (name && (META_READ_FUNCTIONS.has(name) || META_WRITE_FUNCTIONS.has(name))) {
        facts.push(metadataFact(file, symbols, node, name));
      }
      if (name && (OPTION_READ_FUNCTIONS.has(name) || OPTION_WRITE_FUNCTIONS.has(name))) {
        facts.push(optionFact(file, symbols, node, name));
      }
      if (name === REST_ROUTE_FUNCTION) facts.push(restRouteFact(file, symbols, node));
      if (name === SHORTCODE_FUNCTION) facts.push(shortcodeFact(file, symbols, node));

      const method = methodName(node.childForFieldName("function"));
      if (method && PRICE_MUTATION_METHODS.has(method)) facts.push(priceMutationFact(file, symbols, node, method));

      if (name && (REGISTRATION_FUNCTIONS.has(name) || EMITTER_FUNCTIONS.has(name))) {
        const hook = literalString(node.childForFieldName("arguments")?.namedChildren[0]);
        if (isAjaxHook(hook)) {
          const registration = REGISTRATION_FUNCTIONS.has(name);
          facts.push({
            schema_version: ADAPTER_SCHEMA_VERSION,
            kind: registration ? "ajax_handler" : "ajax_emitter",
            file,
            range: range(node),
            containing_symbol_id: containingSymbol(symbols, node)?.id ?? null,
            resolution: "exact",
            attributes: { hook_name: hook, invocation: name, ...(registration && node.childForFieldName("arguments")?.namedChildren[1] ? { callback: node.childForFieldName("arguments")!.namedChildren[1].text } : {}) },
          });
        }
        if (isCartHook(hook)) {
          facts.push({
            schema_version: ADAPTER_SCHEMA_VERSION,
            kind: REGISTRATION_FUNCTIONS.has(name) ? "wc_cart_hook_registration" : "wc_cart_hook_emitter",
            file,
            range: range(node),
            containing_symbol_id: containingSymbol(symbols, node)?.id ?? null,
            resolution: "exact",
            attributes: { hook_name: hook, hook_kind: name.includes("filter") ? "filter" : "action", invocation: name },
          });
        }
      }
    }
    for (const child of node.namedChildren) visit(child);
  };
  visit(tree.rootNode);
  return facts;
}

/** Extracts literal WordPress/WooCommerce facts from indexed JS/TS source. */
export const wordpressWooCommerceAdapter: FrameworkAdapter = {
  name: "wordpress-woocommerce",
  supports(context: FrameworkAdapterContext): boolean {
    return context.index.calls.some((call) => REGISTRATION_FUNCTIONS.has(call.callee_name)
      || EMITTER_FUNCTIONS.has(call.callee_name)
      || META_READ_FUNCTIONS.has(call.callee_name)
      || META_WRITE_FUNCTIONS.has(call.callee_name)
      || OPTION_READ_FUNCTIONS.has(call.callee_name)
      || OPTION_WRITE_FUNCTIONS.has(call.callee_name)
      || call.callee_name === REST_ROUTE_FUNCTION
      || call.callee_name === SHORTCODE_FUNCTION
      || PRICE_MUTATION_METHODS.has(call.callee_name.split(".").at(-1) ?? ""));
  },
  extract(context: FrameworkAdapterContext): AdapterIndex {
    const facts: AdapterFact[] = [];
    const files = new Set(context.index.calls
      .filter((call) => REGISTRATION_FUNCTIONS.has(call.callee_name)
        || EMITTER_FUNCTIONS.has(call.callee_name)
        || META_READ_FUNCTIONS.has(call.callee_name)
        || META_WRITE_FUNCTIONS.has(call.callee_name)
        || OPTION_READ_FUNCTIONS.has(call.callee_name)
        || OPTION_WRITE_FUNCTIONS.has(call.callee_name)
        || call.callee_name === REST_ROUTE_FUNCTION
        || call.callee_name === SHORTCODE_FUNCTION
        || PRICE_MUTATION_METHODS.has(call.callee_name.split(".").at(-1) ?? ""))
      .map((call) => call.file));
    for (const file of files) {
      const source = readFileSync(resolve(context.repository_root, file), "utf8");
      facts.push(...extractFileFacts(file, source, context.index.symbols.filter((symbol) => symbol.file === file)));
    }
    return { schema_version: ADAPTER_SCHEMA_VERSION, adapter: "wordpress-woocommerce", commit_hash: context.index.commit_hash, facts };
  },
};
