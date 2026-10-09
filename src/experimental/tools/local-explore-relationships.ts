import { readFileSync } from "node:fs";
import Parser from "tree-sitter";
import { parseSource } from "../../explorer/parse.js";
import { nodeForRange, offsetsForTree } from "../../explorer/source-offsets.js";
import JavaScript from "tree-sitter-javascript";
import TypeScript from "tree-sitter-typescript";
import type { RepositoryIndex, SymbolRecord } from "../../explorer/indexer.js";
import { checkedFile } from "./local-explore-packing.js";
import {
  flagResolutionRequested,
  configurationKeys,
  selectableEvidenceText,
  type QuestionPart,
  type ValidEvidence,
} from "./local-explore-validation.js";
import { pythonDictionaryLocations, pythonDictionaryRequest, pythonParameterShadowLocations } from "./local-explore-python-dictionary.js";
import { operationChecks, operationTarget } from "./local-explore-operations.js";
import {
  configurationContextRequests,
  configurationContexts,
} from "./local-explore-config-context.js";
import {
  configurationOwnerNames,
  configurationReaderOwner,
  configurationProvenanceContexts,
} from "./local-explore-provenance.js";

type Location = { file: string; line: number };
type Relationship = { requirement: string; alternatives: Location[][]; excluded?: Location[] };
const callableKinds = new Set(["function", "method", "constructor"]);
const identifier = "[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*";
const scopedOperations = new Set([
  "storage",
  "replacement",
  "provider-deletion",
  "cleanup-failure",
  "upload",
  "failure",
]);

export function createRelationshipChecks(root: string, index: RepositoryIndex, query = "") {
  const symbols = new Map(index.symbols.map((symbol) => [symbol.id, symbol]));
  const trees = new Map<string, Parser.Tree>();
  const plans = new Map<string, Relationship[]>();
  const matchesName = (symbol: SymbolRecord, name: string) =>
    name.includes(".") ? symbol.qualified_name === name : symbol.name === name;
  const callable = (id: string | null): SymbolRecord | undefined => {
    let symbol = id ? symbols.get(id) : undefined;
    while (symbol && !callableKinds.has(symbol.kind))
      symbol = symbol.parent_id ? symbols.get(symbol.parent_id) : undefined;
    return symbol;
  };
  const treeFor = (file: string) => {
    let tree = trees.get(file);
    if (!tree) {
      const parser = new Parser();
      parser.setLanguage(
        /\.[cm]?tsx?$/.test(file)
          ? file.endsWith(".tsx")
            ? TypeScript.tsx
            : TypeScript.typescript
          : JavaScript,
      );
      tree = parseSource(parser, readFileSync(checkedFile(root, file), "utf8"));
      trees.set(file, tree);
    }
    return tree;
  };
  const location = (file: string, node: Parser.SyntaxNode): Location => ({
    file,
    line: node.startPosition.row + 1,
  });
  const sameLocation = (a: Location, b: Location) => a.file === b.file && a.line === b.line;

  const callRequests = (part: QuestionPart) =>
    [
      ...part.question.matchAll(
        new RegExp(
          `\\b(?:does|do)\\s+(${identifier})\\s+call\\s+(${identifier})|\\b(${identifier})\\s+calls\\s+(${identifier})`,
          "g",
        ),
      ),
    ].map((match) => ({ callerName: match[1] ?? match[3], calleeName: match[2] ?? match[4] }));

  const operationOwners = (part: QuestionPart) => {
    const target = operationTarget(part);
    if (!target || !scopedOperations.has(part.operation ?? "")) return [];
    return index.symbols.filter(
      (symbol) =>
        callableKinds.has(symbol.kind) &&
        matchesName(symbol, target) &&
        !/(?:^|\/)(?:benchmarks|__tests__|tests)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(
          symbol.file,
        ),
    );
  };
  const scopesOperation = (part: QuestionPart) =>
    Boolean(operationTarget(part) && scopedOperations.has(part.operation ?? ""));
  function operationPlan(part: QuestionPart, owners = operationOwners(part)): Relationship[] {
    return operationChecks(part).map(({ name, pattern }) => ({
      requirement: name,
      alternatives: owners.flatMap((owner) => {
        const source = treeFor(owner.file).rootNode.text.split("\n");
        const declaration = { file: owner.file, line: owner.selection_range.start.line };
        if (name === "requested method declaration") return [[declaration]];
        return source
          .slice(owner.range.start.line - 1, owner.range.end.line)
          .flatMap((quote, offset) => {
            const line = owner.range.start.line + offset;
            if (/^\s*(?:\/\/|\*|\/\*|import\b)/.test(quote) || !quote.match(pattern)) return [];
            // A nested callable or type cannot supply its enclosing method's guard.
            if (
              index.symbols.some(
                (symbol) =>
                  symbol.id !== owner.id &&
                  symbol.file === owner.file &&
                  (callableKinds.has(symbol.kind) || ["interface", "type"].includes(symbol.kind)) &&
                  symbol.range.start.byte > owner.range.start.byte &&
                  symbol.range.end.byte < owner.range.end.byte &&
                  symbol.range.start.line <= line &&
                  symbol.range.end.line >= line,
              )
            )
              return [];
            return [[declaration, { file: owner.file, line }]];
          });
      }),
    }));
  }

  function isShadowed(
    node: Parser.SyntaxNode,
    file: string,
    name: string,
    bindingId: string,
  ): boolean {
    const offsets = offsetsForTree(node.tree);
    for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
      const parameters = ancestor.childForFieldName("parameters");
      if (parameters?.descendantsOfType("identifier").some((item) => item.text === name))
        return true;
      if (
        index.symbols.some(
          (symbol) =>
            symbol.file === file &&
            symbol.name === name &&
            symbol.id !== bindingId &&
            symbol.range.start.byte >= offsets.toByte(ancestor!.startIndex) &&
            symbol.range.end.byte <= offsets.toByte(ancestor!.endIndex) &&
            ancestor!.type !== "program",
        )
      )
        return true;
    }
    return false;
  }

  function configurationPairs(
    setting: string,
    owner: string | undefined,
    providerName: string | undefined,
  ): Location[][] {
    const pairs: Location[][] = [];
    for (const reference of index.references) {
      if (!reference.target_symbol_id || !["exact", "static"].includes(reference.resolution))
        continue;
      const useOwner = callable(reference.source_symbol_id);
      if (owner && (!useOwner || !matchesName(useOwner, owner))) continue;
      const binding = symbols.get(reference.target_symbol_id)!;
      // Only a direct top-level object initializer has a supported provider identity.
      if (binding.kind !== "variable" || binding.parent_id) continue;
      if (providerName && binding.name !== providerName) continue;
      const useTree = treeFor(reference.file);
      const object = nodeForRange(useTree, reference.range);
      const member = object.parent;
      if (
        member?.type !== "member_expression" ||
        member.childForFieldName("object")?.id !== object.id ||
        member.childForFieldName("property")?.text !== setting
      )
        continue;
      const assignment = member.parent;
      if (
        (assignment?.type === "assignment_expression" ||
          assignment?.type === "augmented_assignment_expression") &&
        assignment.childForFieldName("left")?.id === member.id
      )
        continue;
      if (isShadowed(member, reference.file, object.text, binding.id)) continue;
      const provider = treeFor(binding.file)
        .rootNode.descendantsOfType("variable_declarator")
        .find(
          (node) =>
            node.startPosition.row + 1 === binding.range.start.line &&
            node.childForFieldName("name")?.text === binding.name,
        );
      const value = provider?.childForFieldName("value");
      if (
        value?.type !== "object" ||
        provider?.parent?.type !== "lexical_declaration" ||
        !provider.parent.text.startsWith("const ")
      )
        continue;
      // Spreads and duplicate keys can override an apparently matching setting.
      if (value.namedChildren.some((node) => node.type !== "pair")) continue;
      const properties = value.namedChildren.filter(
        (node) => node.childForFieldName("key")?.text === setting,
      );
      if (properties.length !== 1) continue;
      pairs.push([location(binding.file, properties[0]), location(reference.file, member)]);
    }
    return pairs;
  }

  function flagResolverPlan(part: QuestionPart): Relationship[] {
    if (!flagResolutionRequested(part.question)) return [];
    const mappings = index.calls.flatMap((call) => {
      if (
        !/\.[cm]?[jt]sx?$/.test(call.file) ||
        /(?:^|\/)(?:benchmarks|__tests__|tests)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(call.file)
      )
        return [];
      const name = nodeForRange(treeFor(call.file), call.range);
      const node = name.parent;
      if (
        node?.type !== "call_expression" ||
        node.childForFieldName("function")?.type !== "identifier"
      )
        return [];
      const flags =
        node
          .childForFieldName("arguments")
          ?.namedChildren.filter(
            (argument) =>
              argument.type === "string" &&
              /^['"](?:ENABLE_[A-Z0-9_]+|[A-Z0-9_]+_ENABLED)['"]$/.test(argument.text),
          )
          .map((argument) => argument.text.slice(1, -1)) ?? [];
      const pair = node.parent?.type === "pair" ? node.parent : undefined;
      const key = pair?.childForFieldName("key")?.text;
      return flags.map((flag) => ({ call, node, flag, key }));
    });
    const normalized = part.question.toLowerCase().replace(/[^a-z0-9]/g, "");
    const namedKeys = mappings.filter(
      (mapping) => mapping.key && normalized.includes(mapping.key.toLowerCase()),
    );
    const requestedFlags: string[] =
      part.question.match(/\b(?:ENABLE_[A-Z0-9_]+|[A-Z0-9_]+_ENABLED)\b/g) ?? [];
    const selected = namedKeys.length
      ? namedKeys
      : requestedFlags.length
        ? mappings.filter((mapping) => requestedFlags.includes(mapping.flag))
        : mappings;
    const checks: Relationship[] = namedKeys.length
      ? []
      : requestedFlags
          .filter((flag) => !selected.some((mapping) => mapping.flag === flag))
          .map((flag) => ({ requirement: `${flag} resolved helper`, alternatives: [] }));
    if (!selected.length)
      return checks.length
        ? checks
        : [{ requirement: "requested flag resolver binding", alternatives: [] }];
    for (const { call, node, flag } of selected) {
      const helper = call.callee_symbol_id ? symbols.get(call.callee_symbol_id) : undefined;
      const resolved =
        helper &&
        callableKinds.has(helper.kind) &&
        ["exact", "static"].includes(call.resolution) &&
        !isShadowed(node, call.file, call.callee_name, helper.id);
      if (!resolved || !/\.[cm]?[jt]sx?$/.test(helper.file)) {
        checks.push({ requirement: `${flag} resolved helper`, alternatives: [] });
        continue;
      }
      const helperName = nodeForRange(treeFor(helper.file), helper.selection_range);
      const declaration = helperName.parent;
      const implementation =
        declaration?.type === "variable_declarator"
          ? declaration.childForFieldName("value")
          : declaration;
      const body = implementation?.childForFieldName("body");
      const base = [
        location(call.file, node),
        { file: helper.file, line: helper.selection_range.start.line },
      ];
      checks.push({ requirement: `${flag} resolved helper`, alternatives: body ? [base] : [] });
      if (!body) continue;
      const direct = (child: Parser.SyntaxNode) => {
        for (
          let ancestor = child.parent;
          ancestor && ancestor.id !== implementation?.id;
          ancestor = ancestor.parent
        )
          if (
            [
              "function_declaration",
              "function_expression",
              "arrow_function",
              "method_definition",
              "generator_function",
              "generator_function_declaration",
            ].includes(ancestor.type)
          )
            return false;
        return true;
      };
      const source = treeFor(helper.file).rootNode.text.split("\n");
      const substantive = (child: Parser.SyntaxNode): Location[] => {
        const lines: Location[] = [];
        for (let row = child.startPosition.row; row <= child.endPosition.row; row++) {
          const text = source[row]?.trim();
          if (text && selectableEvidenceText(text) && !/^(?:\/\/|\*|\/\*)/.test(text))
            lines.push({ file: helper.file, line: row + 1 });
        }
        return lines;
      };
      const inputs = body
        .descendantsOfType("variable_declarator")
        .filter(
          (input) =>
            direct(input) &&
            !["arrow_function", "function_expression", "class"].includes(
              input.childForFieldName("value")?.type ?? "",
            ),
        );
      for (const input of inputs) {
        checks.push({
          requirement: `${flag} resolver input at ${helper.file}:${input.startPosition.row + 1}`,
          alternatives: [[...base, ...substantive(input)]],
        });
      }
      const outcomes = body
        .descendantsOfType(["return_statement", "throw_statement"])
        .filter(direct);
      if (body.type !== "statement_block") outcomes.push(body);
      for (const outcome of outcomes) {
        const locations = [...base, ...substantive(outcome)];
        for (
          let ancestor = outcome.parent;
          ancestor && ancestor.id !== implementation?.id;
          ancestor = ancestor.parent
        ) {
          if (ancestor.type === "else_clause") locations.push(location(helper.file, ancestor));
          if (ancestor.type === "if_statement") {
            const condition = ancestor.childForFieldName("condition");
            if (condition) locations.push(...substantive(condition));
          }
        }
        checks.push({
          requirement: `${flag} resolver outcome at ${helper.file}:${outcome.startPosition.row + 1}`,
          alternatives: [locations],
        });
      }
      if (!outcomes.length)
        checks.push({ requirement: `${flag} resolver outcomes`, alternatives: [] });
    }
    return checks;
  }

  function configurationReadPlan(part: QuestionPart): Relationship[] {
    const keys = configurationKeys(part.question);
    if (!keys.length) return [];
    const checks: Relationship[] = [];
    const ownerNames = configurationOwnerNames(part.question, index);
    const seenOwners = new Set<string>();
    const callableTypes = [
      "function_declaration",
      "function_expression",
      "arrow_function",
      "method_definition",
      "generator_function",
      "generator_function_declaration",
    ];
    for (const key of keys) {
      let found = false;
      for (const call of index.calls) {
        if (
          !/\.[cm]?[jt]sx?$/.test(call.file) ||
          !/\.(?:get|getOrThrow)$/.test(call.callee_name) ||
          /(?:^|\/)(?:benchmarks|__tests__|tests)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(call.file)
        )
          continue;
        const tree = treeFor(call.file);
        let node: Parser.SyntaxNode | null = nodeForRange(tree, call.range);
        while (node && node.type !== "call_expression") node = node.parent;
        const argument = node?.childForFieldName("arguments")?.namedChildren[0];
        if (!node || argument?.type !== "string" || argument.text.slice(1, -1) !== key) continue;
        const reader = configurationReaderOwner(node, ownerNames);
        if (!reader.matches) continue;
        found = true;
        const source = tree.rootNode.text.split("\n");
        const substantive = (item: Parser.SyntaxNode) => {
          const locations: Location[] = [];
          for (let row = item.startPosition.row; row <= item.endPosition.row; row++) {
            const text = source[row]?.trim();
            if (text && selectableEvidenceText(text) && !/^(?:[{}();,]+$|\/\/|\*|\/\*)/.test(text))
              locations.push({ file: call.file, line: row + 1 });
          }
          return locations;
        };
        let owner = node.parent;
        while (owner && !callableTypes.includes(owner.type)) owner = owner.parent;
        const guarded = (item: Parser.SyntaxNode): Location[] => {
          const locations = substantive(item);
          for (
            let ancestor = item.parent;
            ancestor && ancestor.id !== owner?.id;
            ancestor = ancestor.parent
          ) {
            if (ancestor.type === "else_clause") locations.push(location(call.file, ancestor));
            if (ancestor.type === "if_statement") {
              const condition = ancestor.childForFieldName("condition");
              if (condition) locations.push(...substantive(condition));
            }
          }
          return locations;
        };
        const base = [...reader.lines.map((line) => ({ file: call.file, line })), ...guarded(node)];
        checks.push({
          requirement: `${key} configuration read at ${call.file}:${node.startPosition.row + 1}`,
          alternatives: [base],
        });
        const ownerKey = `${call.file}:${owner?.startIndex}`;
        if (!owner || seenOwners.has(ownerKey)) continue;
        seenOwners.add(ownerKey);
        const body = owner.childForFieldName("body");
        if (!body) continue;
        const outcomes = body.descendantsOfType(["return_statement", "throw_statement"]);
        if (body.type !== "statement_block") outcomes.push(body);
        for (const outcome of outcomes) {
          let ancestor = outcome.parent;
          while (ancestor && ancestor.id !== owner.id && !callableTypes.includes(ancestor.type))
            ancestor = ancestor.parent;
          if (ancestor?.id !== owner.id) continue;
          checks.push({
            requirement: `${key} configuration outcome at ${call.file}:${outcome.startPosition.row + 1}`,
            alternatives: [[...base, ...guarded(outcome)]],
          });
        }
      }
      const request = configurationContextRequests(part.question);
      if (!found && !request.constant && !request.order)
        checks.push({ requirement: `${key} configuration read`, alternatives: [] });
    }
    return checks;
  }

  function pythonDictionaryPlan(): Relationship[] {
    if (!pythonDictionaryRequest(query)) return [];
    const locations = pythonDictionaryLocations(root, index.symbols, query);
    const shadow = locations ? null : pythonParameterShadowLocations(root, index.symbols, query);
    if (shadow) return [{ requirement: "Python dictionary shadowed by reader parameter", alternatives: [shadow.locations], excluded: shadow.excluded }];
    return [{ requirement: "Python dictionary source rows", alternatives: locations ? [locations] : [] }];
  }

  function plan(part: QuestionPart): Relationship[] {
    const key = `${part.operation ?? ""}:${part.question}`;
    const cached = plans.get(key);
    if (cached) return cached;
    if (scopesOperation(part)) {
      const checks = operationPlan(part);
      plans.set(key, checks);
      return checks;
    }
    const checks: Relationship[] = [
      ...pythonDictionaryPlan(),
      ...flagResolverPlan(part),
      ...configurationReadPlan(part),
      ...configurationProvenanceContexts(index, part.question, treeFor).map((context) => ({
        requirement: context.requirement,
        alternatives: context.locations.length ? [context.locations] : [],
      })),
    ];
    const contextRequests = configurationContextRequests(part.question);
    if (contextRequests.initialization || contextRequests.provider) {
      const contexts = [...new Set(index.symbols.map((symbol) => symbol.file))]
        .filter(
          (file) =>
            /\.[cm]?[jt]sx?$/.test(file) &&
            !/(?:^|\/)(?:benchmarks|__tests__|tests)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file),
        )
        .flatMap((file) =>
          configurationContexts(
            treeFor(file),
            file,
            part.question,
            configurationOwnerNames(part.question, index),
          ).map((context) => ({
            requirement: context.requirement,
            alternatives: context.lines.length
              ? [context.lines.map((line) => ({ file, line }))]
              : [],
          })),
        );
      checks.push(...contexts);
      if (
        contextRequests.initialization &&
        !contexts.some((context) => context.requirement.startsWith("configuration initialization"))
      )
        checks.push({ requirement: "configuration initialization context", alternatives: [] });
      if (
        contextRequests.provider &&
        !contexts.some((context) => !context.requirement.startsWith("configuration initialization"))
      )
        checks.push({ requirement: "configuration provider provenance context", alternatives: [] });
    }
    for (const { callerName, calleeName } of part.operation ? [] : callRequests(part)) {
      const callers = index.symbols.filter(
        (symbol) => callableKinds.has(symbol.kind) && matchesName(symbol, callerName),
      );
      const alternatives: Location[][] = [];
      if (callers.length === 1)
        for (const call of index.calls) {
          if (callable(call.caller_symbol_id)?.id !== callers[0].id) continue;
          const callee = call.callee_symbol_id ? symbols.get(call.callee_symbol_id) : undefined;
          const node = nodeForRange(treeFor(call.file), call.range);
          const shadowed =
            callee &&
            !call.callee_name.includes(".") &&
            isShadowed(node, call.file, call.callee_name, callee.id);
          if (shadowed) continue;
          const resolved =
            callee &&
            ["exact", "static"].includes(call.resolution) &&
            matchesName(callee, calleeName);
          const spelling = calleeName.includes(".")
            ? call.callee_name === calleeName
            : call.callee_name.split(".").at(-1) === calleeName;
          if (resolved || spelling)
            alternatives.push([{ file: call.file, line: call.range.start.line }]);
        }
      checks.push({ requirement: `${callerName} -> ${calleeName} caller identity`, alternatives });
      if (/\bimplementation\b|\bcallee\b/.test(part.question)) {
        const resolved = index.calls.filter(
          (call) =>
            callable(call.caller_symbol_id)?.id === callers[0]?.id &&
            call.callee_symbol_id &&
            ["exact", "static"].includes(call.resolution) &&
            matchesName(symbols.get(call.callee_symbol_id)!, calleeName),
        );
        checks.push({
          requirement: `${calleeName} statically resolved implementation`,
          alternatives: resolved.map((call) => {
            const callee = symbols.get(call.callee_symbol_id!)!;
            return [
              { file: call.file, line: call.range.start.line },
              { file: callee.file, line: callee.selection_range.start.line },
            ];
          }),
        });
      }
    }
    if (/configur|setting/i.test(part.question) && /\bused\b/.test(part.question)) {
      const settings = [
        ...part.question.matchAll(
          /\b([a-z][\w$]*[A-Z][\w$]*)\s+configured\b|\b(?:configure|configures|setting)\s+([a-z][\w$]*[A-Z][\w$]*)\b/g,
        ),
      ].map((match) => match[1] ?? match[2]);
      const owner = part.question.match(new RegExp(`\\bused\\s+in\\s+(${identifier})`))?.[1];
      for (const setting of new Set(settings)) {
        const preceding = part.question.match(
          new RegExp(`\\b([A-Za-z_$][\\w$]*)[.\\s]+${setting}\\s+configured\\b`),
        )?.[1];
        const providerName =
          preceding && !["is", "the", "a"].includes(preceding) ? preceding : undefined;
        checks.push({
          requirement: `${setting} configuration provider and use${owner ? ` in ${owner}` : ""}`,
          alternatives: configurationPairs(setting, owner, providerName),
        });
      }
    }
    plans.set(key, checks);
    return checks;
  }

  return {
    replacedRequirements(part: QuestionPart) {
      if (scopesOperation(part)) return operationChecks(part).map((check) => check.name);
      return callRequests(part).map(({ calleeName }) => `${calleeName} call`);
    },
    // Source rows a requirement proves are not read; the model must not cite them.
    excluded(part: QuestionPart): Location[] {
      return plan(part).flatMap((check) => check.excluded ?? []);
    },
    missing(part: QuestionPart, evidence: ValidEvidence[]) {
      const satisfied = (check: Relationship) =>
        check.alternatives.some((pair) =>
          pair.every((item) => evidence.some((cite) => sameLocation(item, cite))),
        );
      const missing = plan(part)
        .filter((check) => !satisfied(check))
        .map((check) => check.requirement);
      if (
        scopesOperation(part) &&
        !missing.length &&
        !operationOwners(part).some((owner) => operationPlan(part, [owner]).every(satisfied))
      ) {
        missing.push(
          `operation evidence must belong to one requested method: ${operationTarget(part)}`,
        );
      }
      return missing;
    },
    checklist(part: QuestionPart, lines: Array<ValidEvidence & { ref: string }>) {
      return plan(part).map((check) => ({
        requirement: check.requirement,
        alternative_ref_sets: check.alternatives
          .map((pair) => pair.map((item) => lines.find((cite) => sameLocation(item, cite))?.ref))
          .filter((pair): pair is string[] => pair.every((ref) => ref !== undefined)),
      }));
    },
  };
}
