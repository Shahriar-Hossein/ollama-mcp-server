import type Parser from "tree-sitter";
import type { RepositoryIndex } from "../../explorer/indexer.js";
import { configurationKeys } from "./local-explore-validation.js";
import {
  configurationReaderOwner,
  provenanceLines,
  type ProvenanceContext,
} from "./local-explore-provenance.js";

function bindingTargets(node: Parser.SyntaxNode | null): Parser.SyntaxNode[] {
  if (!node) return [];
  if (
    [
      "identifier",
      "type_identifier",
      "shorthand_property_identifier_pattern",
      "member_expression",
      "subscript_expression",
    ].includes(node.type)
  )
    return [node];
  if (node.type === "pair_pattern") return bindingTargets(node.childForFieldName("value"));
  if (["assignment_pattern", "object_assignment_pattern"].includes(node.type))
    return bindingTargets(node.childForFieldName("left"));
  if (["required_parameter", "optional_parameter"].includes(node.type))
    return bindingTargets(node.childForFieldName("pattern"));
  if (
    [
      "object_pattern",
      "array_pattern",
      "rest_pattern",
      "formal_parameters",
      "parenthesized_expression",
    ].includes(node.type)
  )
    return node.namedChildren.flatMap(bindingTargets);
  return [];
}

function shadowed(tree: Parser.Tree, name: string, allowed?: Parser.SyntaxNode): boolean {
  return tree.rootNode
    .descendantsOfType([
      "variable_declarator",
      "required_parameter",
      "optional_parameter",
      "function_declaration",
      "class_declaration",
      "catch_clause",
      "formal_parameters",
      "arrow_function",
    ])
    .some(
      (node) =>
        node.id !== allowed?.id &&
        bindingTargets(
          node.childForFieldName("name") ??
            node.childForFieldName("pattern") ??
            node.childForFieldName("parameter") ??
            (node.type === "formal_parameters" ? node : null),
        ).some((binding) => binding.text === name),
    );
}

function written(tree: Parser.Tree, name: string, member?: string): boolean {
  return tree.rootNode
    .descendantsOfType([
      "assignment_expression",
      "augmented_assignment_expression",
      "update_expression",
    ])
    .some((node) =>
      bindingTargets(node.childForFieldName("left") ?? node.childForFieldName("argument")).some(
        (target) => {
          if (target.text === name) return true;
          if (!member || target.childForFieldName("object")?.text !== name) return false;
          if (target.type === "member_expression")
            return target.childForFieldName("property")?.text === member;
          const key = target.childForFieldName("index");
          return key?.type === "string" && key.text.slice(1, -1) === member;
        },
      ),
    );
}

function ordinaryInstanceMethod(method: Parser.SyntaxNode): boolean {
  return !method.children.some((child) => ["static", "get", "set"].includes(child.type));
}

function readsKey(method: Parser.SyntaxNode, keys: string[]): boolean {
  return method
    .descendantsOfType(["member_expression", "subscript_expression", "call_expression"])
    .some((node) => {
      for (let owner = node.parent; owner && owner.id !== method.id; owner = owner.parent)
        if (
          [
            "method_definition",
            "function_declaration",
            "function_expression",
            "arrow_function",
          ].includes(owner.type)
        )
          return false;
      if (node.type === "member_expression")
        return keys.includes(node.childForFieldName("property")?.text ?? "");
      if (node.type === "subscript_expression") {
        const key = node.childForFieldName("index");
        return key?.type === "string" && keys.includes(key.text.slice(1, -1));
      }
      const callee = node.childForFieldName("function");
      const key = node.childForFieldName("arguments")?.namedChildren[0];
      return (
        /^(?:get|getOrThrow)$/.test(callee?.childForFieldName("property")?.text ?? "") &&
        key?.type === "string" &&
        keys.includes(key.text.slice(1, -1))
      );
    });
}

// A direct local construction supplies context, never runtime instance/provider identity.
export function defaultInstanceContexts(
  index: RepositoryIndex,
  question: string,
  treeFor: (file: string) => Parser.Tree,
  names: string[],
): ProvenanceContext[] {
  const keys = configurationKeys(question);
  const contexts: ProvenanceContext[] = [];
  for (const file of new Set(index.dependencies.map((dependency) => dependency.file))) {
    if (
      !/\.[cm]?[jt]sx?$/.test(file) ||
      /(?:^|\/)(?:benchmarks|__tests__|tests)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)
    )
      continue;
    const tree = treeFor(file);
    for (const imported of tree.rootNode.descendantsOfType("import_statement")) {
      const name = imported.namedChildren
        .find((node) => node.type === "import_clause")
        ?.namedChildren.find((node) => node.type === "identifier")?.text;
      if (!name) continue;
      const calls = tree.rootNode.descendantsOfType("call_expression").filter((call) => {
        const callee = call.childForFieldName("function");
        return (
          callee?.type === "member_expression" && callee.childForFieldName("object")?.text === name
        );
      });
      if (!calls.length) continue;
      const dependency = index.dependencies.find(
        (item) =>
          item.file === file &&
          item.module_specifier === imported.childForFieldName("source")?.text.slice(1, -1),
      );
      const targetFile = dependency?.target_file;
      if (!targetFile) continue;
      const target =
        targetFile && /\.[cm]?[jt]sx?$/.test(targetFile) ? treeFor(targetFile) : undefined;
      const exports =
        target?.rootNode.namedChildren.filter(
          (node) => node.type === "export_statement" && /^export\s+default\b/.test(node.text),
        ) ?? [];
      const exported = exports.length === 1 ? exports[0] : undefined;
      const value = exported?.childForFieldName("value");
      const declarations =
        value?.type === "identifier"
          ? (target?.rootNode.namedChildren
              .filter(
                (node) => node.type === "lexical_declaration" && node.text.startsWith("const "),
              )
              .flatMap((node) => node.namedChildren)
              .filter(
                (node) =>
                  node.type === "variable_declarator" &&
                  node.childForFieldName("name")?.text === value.text,
              ) ?? [])
          : [];
      const declaration = declarations.length === 1 ? declarations[0] : undefined;
      const creation =
        value?.type === "new_expression" ? value : declaration?.childForFieldName("value");
      const classReference =
        creation?.type === "new_expression" ? creation.childForFieldName("constructor") : undefined;
      const classes =
        classReference?.type === "identifier"
          ? (target?.rootNode
              .descendantsOfType("class_declaration")
              .filter(
                (node) =>
                  node.childForFieldName("name")?.text === classReference.text &&
                  (node.parent?.type === "program" || node.parent?.parent?.type === "program"),
              ) ?? [])
          : [];
      const classNode = classes.length === 1 ? classes[0] : undefined;
      const methods =
        classNode
          ?.childForFieldName("body")
          ?.namedChildren.filter((node) => node.type === "method_definition") ?? [];
      const constructors = methods.filter(
        (method) => method.childForFieldName("name")?.text === "constructor",
      );
      const initialization = constructors.length === 1 ? constructors[0] : undefined;
      for (const call of calls) {
        const methodName = call.childForFieldName("function")?.childForFieldName("property")?.text;
        const readers = methods.filter(
          (method) => method.childForFieldName("name")?.text === methodName,
        );
        const reader = readers.length === 1 ? readers[0] : undefined;
        const ownerMatches = reader
          ? configurationReaderOwner(reader, names).matches
          : !names.length || configurationReaderOwner(call, names).matches;
        if (!ownerMatches) continue;
        // Explicit instance questions keep unresolved exports; ordinary imports need a named read.
        if (keys.length && reader && !readsKey(reader, keys)) continue;
        if (!reader && !/\bdefault[ -](?:import|export)|\binstance\b/i.test(question)) continue;
        const writes =
          target && value?.type === "identifier" && written(target, value.text, methodName);
        const constructorShadowed =
          target && classReference && shadowed(target, classReference.text, classNode);
        const constructorWritten = target && classReference && written(target, classReference.text);
        const valueShadowed =
          target && value?.type === "identifier" && shadowed(target, value.text, declaration);
        const importedWrite = written(tree, name, methodName);
        const valid =
          targetFile &&
          !target?.rootNode.hasError &&
          exported &&
          creation?.type === "new_expression" &&
          classNode &&
          reader &&
          ordinaryInstanceMethod(reader) &&
          initialization &&
          !shadowed(tree, name) &&
          !/^import\s+type\b/.test(imported.text) &&
          !writes &&
          !importedWrite &&
          !constructorShadowed &&
          !constructorWritten &&
          !valueShadowed &&
          !creation
            .childForFieldName("arguments")
            ?.namedChildren.some((node) => node.type === "spread_element");
        const locations = valid
          ? [
              ...provenanceLines(file, imported),
              ...provenanceLines(file, call),
              ...provenanceLines(targetFile, exported),
              ...provenanceLines(targetFile, creation),
              { file: targetFile, line: classNode.startPosition.row + 1 },
              ...provenanceLines(targetFile, initialization),
              ...provenanceLines(targetFile, reader),
            ]
          : [];
        contexts.push({
          requirement: `default-import instance ${name}.${methodName} construction and reader context at ${file}:${call.startPosition.row + 1}`,
          locations,
        });
        contexts.push({
          requirement: "default-import instance configuration semantics require parent review",
          locations: [],
        });
      }
    }
  }
  return contexts;
}
