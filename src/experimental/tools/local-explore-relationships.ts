import { readFileSync } from "node:fs";
import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import TypeScript from "tree-sitter-typescript";
import type { RepositoryIndex, SymbolRecord } from "../../explorer/indexer.js";
import { checkedFile } from "./local-explore-packing.js";
import type { QuestionPart, ValidEvidence } from "./local-explore-validation.js";

type Location = { file: string; line: number };
type Relationship = { requirement: string; alternatives: Location[][] };
const callableKinds = new Set(["function", "method", "constructor"]);
const identifier = "[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*";

export function createRelationshipChecks(root: string, index: RepositoryIndex) {
  const symbols = new Map(index.symbols.map((symbol) => [symbol.id, symbol]));
  const trees = new Map<string, Parser.Tree>();
  const plans = new Map<string, Relationship[]>();
  const matchesName = (symbol: SymbolRecord, name: string) =>
    name.includes(".") ? symbol.qualified_name === name : symbol.name === name;
  const callable = (id: string | null): SymbolRecord | undefined => {
    let symbol = id ? symbols.get(id) : undefined;
    while (symbol && !callableKinds.has(symbol.kind)) symbol = symbol.parent_id ? symbols.get(symbol.parent_id) : undefined;
    return symbol;
  };
  const treeFor = (file: string) => {
    let tree = trees.get(file);
    if (!tree) {
      const parser = new Parser();
      parser.setLanguage(/\.[cm]?tsx?$/.test(file) ? (file.endsWith(".tsx") ? TypeScript.tsx : TypeScript.typescript) : JavaScript);
      tree = parser.parse(readFileSync(checkedFile(root, file), "utf8"));
      trees.set(file, tree);
    }
    return tree;
  };
  const location = (file: string, node: Parser.SyntaxNode): Location => ({ file, line: node.startPosition.row + 1 });
  const sameLocation = (a: Location, b: Location) => a.file === b.file && a.line === b.line;

  const callRequests = (part: QuestionPart) => [...part.question.matchAll(new RegExp(
    `\\b(?:does|do)\\s+(${identifier})\\s+call\\s+(${identifier})|\\b(${identifier})\\s+calls\\s+(${identifier})`, "g",
  ))].map((match) => ({ callerName: match[1] ?? match[3], calleeName: match[2] ?? match[4] }));

  function isShadowed(node: Parser.SyntaxNode, file: string, name: string, bindingId: string): boolean {
    for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
      const parameters = ancestor.childForFieldName("parameters");
      if (parameters?.descendantsOfType("identifier").some((item) => item.text === name)) return true;
      if (index.symbols.some((symbol) => symbol.file === file && symbol.name === name
        && symbol.id !== bindingId && symbol.range.start.byte >= ancestor!.startIndex && symbol.range.end.byte <= ancestor!.endIndex
        && ancestor!.type !== "program")) return true;
    }
    return false;
  }

  function configurationPairs(setting: string, owner: string | undefined, providerName: string | undefined): Location[][] {
    const pairs: Location[][] = [];
    for (const reference of index.references) {
      if (!reference.target_symbol_id || !["exact", "static"].includes(reference.resolution)) continue;
      const useOwner = callable(reference.source_symbol_id);
      if (owner && (!useOwner || !matchesName(useOwner, owner))) continue;
      const binding = symbols.get(reference.target_symbol_id)!;
      // Only a direct top-level object initializer has a supported provider identity.
      if (binding.kind !== "variable" || binding.parent_id) continue;
      if (providerName && binding.name !== providerName) continue;
      const useTree = treeFor(reference.file);
      const object = useTree.rootNode.descendantForPosition(
        { row: reference.range.start.line - 1, column: reference.range.start.column - 1 },
        { row: reference.range.end.line - 1, column: reference.range.end.column - 1 },
      );
      const member = object.parent;
      if (member?.type !== "member_expression" || member.childForFieldName("object")?.id !== object.id
        || member.childForFieldName("property")?.text !== setting) continue;
      const assignment = member.parent;
      if ((assignment?.type === "assignment_expression" || assignment?.type === "augmented_assignment_expression")
        && assignment.childForFieldName("left")?.id === member.id) continue;
      if (isShadowed(member, reference.file, object.text, binding.id)) continue;
      const provider = treeFor(binding.file).rootNode.descendantsOfType("variable_declarator")
        .find((node) => node.startPosition.row + 1 === binding.range.start.line && node.childForFieldName("name")?.text === binding.name);
      const value = provider?.childForFieldName("value");
      if (value?.type !== "object" || provider?.parent?.type !== "lexical_declaration"
        || !provider.parent.text.startsWith("const ")) continue;
      // Spreads and duplicate keys can override an apparently matching setting.
      if (value.namedChildren.some((node) => node.type !== "pair")) continue;
      const properties = value.namedChildren.filter((node) => node.childForFieldName("key")?.text === setting);
      if (properties.length !== 1) continue;
      pairs.push([location(binding.file, properties[0]), location(reference.file, member)]);
    }
    return pairs;
  }

  function plan(part: QuestionPart): Relationship[] {
    const cached = plans.get(part.question);
    if (cached) return cached;
    const checks: Relationship[] = [];
    for (const { callerName, calleeName } of callRequests(part)) {
      const callers = index.symbols.filter((symbol) => callableKinds.has(symbol.kind) && matchesName(symbol, callerName));
      const alternatives: Location[][] = [];
      if (callers.length === 1) for (const call of index.calls) {
        if (callable(call.caller_symbol_id)?.id !== callers[0].id) continue;
        const callee = call.callee_symbol_id ? symbols.get(call.callee_symbol_id) : undefined;
        const node = treeFor(call.file).rootNode.descendantForPosition(
          { row: call.range.start.line - 1, column: call.range.start.column - 1 },
          { row: call.range.end.line - 1, column: call.range.end.column - 1 },
        );
        const shadowed = callee && !call.callee_name.includes(".") && isShadowed(node, call.file, call.callee_name, callee.id);
        if (shadowed) continue;
        const resolved = callee && ["exact", "static"].includes(call.resolution) && matchesName(callee, calleeName);
        const spelling = calleeName.includes(".") ? call.callee_name === calleeName
          : call.callee_name.split(".").at(-1) === calleeName;
        if (resolved || spelling) alternatives.push([{ file: call.file, line: call.range.start.line }]);
      }
      checks.push({ requirement: `${callerName} -> ${calleeName} caller identity`, alternatives });
      if (/\bimplementation\b|\bcallee\b/.test(part.question)) {
        const resolved = index.calls.filter((call) => callable(call.caller_symbol_id)?.id === callers[0]?.id
          && call.callee_symbol_id && ["exact", "static"].includes(call.resolution)
          && matchesName(symbols.get(call.callee_symbol_id)!, calleeName));
        checks.push({ requirement: `${calleeName} statically resolved implementation`, alternatives: resolved.map((call) => {
          const callee = symbols.get(call.callee_symbol_id!)!;
          return [{ file: call.file, line: call.range.start.line }, { file: callee.file, line: callee.selection_range.start.line }];
        }) });
      }
    }
    if (/configur|setting/i.test(part.question) && /\bused\b/.test(part.question)) {
      const settings = [...part.question.matchAll(/\b([a-z][\w$]*[A-Z][\w$]*)\s+configured\b|\b(?:configure|configures|setting)\s+([a-z][\w$]*[A-Z][\w$]*)\b/g)]
        .map((match) => match[1] ?? match[2]);
      const owner = part.question.match(new RegExp(`\\bused\\s+in\\s+(${identifier})`))?.[1];
      for (const setting of new Set(settings)) {
        const preceding = part.question.match(new RegExp(`\\b([A-Za-z_$][\\w$]*)[.\\s]+${setting}\\s+configured\\b`))?.[1];
        const providerName = preceding && !["is", "the", "a"].includes(preceding) ? preceding : undefined;
        checks.push({
          requirement: `${setting} configuration provider and use${owner ? ` in ${owner}` : ""}`,
          alternatives: configurationPairs(setting, owner, providerName),
        });
      }
    }
    plans.set(part.question, checks);
    return checks;
  }

  return {
    replacedRequirements(part: QuestionPart) {
      return callRequests(part).map(({ calleeName }) => `${calleeName} call`);
    },
    missing(part: QuestionPart, evidence: ValidEvidence[]) {
      return plan(part).filter((check) => !check.alternatives.some((pair) => pair.every((item) => evidence.some((cite) => sameLocation(item, cite)))))
        .map((check) => check.requirement);
    },
    checklist(part: QuestionPart, lines: Array<ValidEvidence & { ref: string }>) {
      return plan(part).map((check) => ({
        requirement: check.requirement,
        alternative_ref_sets: check.alternatives.map((pair) => pair.map((item) => lines.find((cite) => sameLocation(item, cite))?.ref))
          .filter((pair): pair is string[] => pair.every((ref) => ref !== undefined)),
      }));
    },
  };
}
