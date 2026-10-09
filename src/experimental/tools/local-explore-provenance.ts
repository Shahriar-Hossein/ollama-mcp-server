import type Parser from "tree-sitter";
import type { RepositoryIndex } from "../../explorer/indexer.js";
import { configurationContextRequests } from "./local-explore-config-context.js";
import { selectableEvidenceText } from "./local-explore-validation.js";

type Location = { file: string; line: number };
export type ProvenanceContext = { requirement: string; locations: Location[] };

export function configurationOwnerNames(question: string, index: RepositoryIndex): string[] {
  const explicit = [
    ...question.matchAll(/\b(?:in|by|for|through)\s+`?([A-Z][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/g),
  ]
    .map((match) => match[1])
    .filter((name) => !/^[A-Z0-9_]+$/.test(name));
  const names = [
    ...new Set([
      ...explicit,
      ...index.symbols
        .filter(
          (symbol) =>
            ["class", "function", "method"].includes(symbol.kind) &&
            symbol.name !== "constructor" &&
            !/(?:^|\/)(?:benchmarks|__tests__|tests)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(
              symbol.file,
            ) &&
            (symbol.kind !== "method" || symbol.qualified_name.includes(".")) &&
            new RegExp(
              `(?<![\\w$])${symbol.qualified_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w$])`,
            ).test(question),
        )
        .map((symbol) => symbol.qualified_name),
    ]),
  ];
  return names.filter((name) => !names.some((other) => other.startsWith(`${name}.`)));
}

export function configurationReaderOwner(node: Parser.SyntaxNode, names: string[]) {
  const owners: Parser.SyntaxNode[] = [];
  for (let ancestor: Parser.SyntaxNode | null = node; ancestor; ancestor = ancestor.parent) {
    if (
      ["class_declaration", "class", "function_declaration", "method_definition"].includes(
        ancestor.type,
      )
    )
      owners.push(ancestor);
    if (ancestor.type === "export_statement") {
      const declaration = ancestor.childForFieldName("declaration");
      if (
        declaration?.type === "class_declaration" &&
        !owners.some((owner) => owner.id === declaration.id)
      )
        owners.push(declaration);
    }
  }
  const className = owners
    .find((owner) => ["class_declaration", "class"].includes(owner.type))
    ?.childForFieldName("name")?.text;
  const matched = owners.filter((owner) => {
    const name = owner.childForFieldName("name")?.text;
    return name && (names.includes(name) || names.includes(`${className}.${name}`));
  });
  return {
    matches: !names.length || matched.length > 0,
    lines: (names.length ? matched : []).flatMap((owner) => {
      const name = owner.childForFieldName("name");
      return name ? [name.startPosition.row + 1] : [];
    }),
  };
}

function linesFor(file: string, node: Parser.SyntaxNode): Location[] {
  const source = node.tree.rootNode.text.split("\n");
  const lines: Location[] = [];
  for (let row = node.startPosition.row; row <= node.endPosition.row; row++) {
    const text = source[row]?.trim();
    if (text && selectableEvidenceText(text) && !/^(?:[{}();,]+$|\/\/|\*|\/\*)/.test(text))
      lines.push({ file, line: row + 1 });
  }
  return lines;
}

// One direct import and initializer only; the source chain does not prove runtime values.
export function configurationProvenanceContexts(
  index: RepositoryIndex,
  question: string,
  treeFor: (file: string) => Parser.Tree,
): ProvenanceContext[] {
  const request = configurationContextRequests(question);
  if (!request.constant && !request.order) return [];
  const names = configurationOwnerNames(question, index);
  const contexts: ProvenanceContext[] = [];
  const seen = new Set<string>();
  const symbols = new Map(index.symbols.map((symbol) => [symbol.id, symbol]));
  const importsByFile = new Map<string, Parser.SyntaxNode[]>();
  for (const reference of index.references) {
    if (
      !/\.[cm]?[jt]sx?$/.test(reference.file) ||
      /(?:^|\/)(?:benchmarks|__tests__|tests)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(reference.file)
    )
      continue;
    const tree = treeFor(reference.file);
    const node = tree.rootNode.descendantForPosition(
      { row: reference.range.start.line - 1, column: reference.range.start.column - 1 },
      { row: reference.range.end.line - 1, column: reference.range.end.column - 1 },
    );
    if (node.type !== "identifier") continue;
    let imports = importsByFile.get(reference.file);
    if (!imports) {
      imports = tree.rootNode.descendantsOfType("import_statement");
      importsByFile.set(reference.file, imports);
    }
    const imported = imports.find((statement) =>
      statement
        .descendantsOfType("import_specifier")
        .some(
          (specifier) =>
            (specifier.childForFieldName("alias") ?? specifier.childForFieldName("name"))?.text ===
            node.text,
        ),
    );
    if (!imported || (node.startIndex >= imported.startIndex && node.endIndex <= imported.endIndex))
      continue;
    const owner = configurationReaderOwner(node, names);
    if (!owner.matches) continue;
    // Exclude types, writes and bare imports from value provenance.
    let use = node;
    if (
      node.parent?.type === "member_expression" &&
      node.parent.childForFieldName("object")?.id === node.id
    )
      use = node.parent;
    if (
      use.parent?.type === "call_expression" &&
      use.parent.childForFieldName("function")?.id === use.id
    )
      continue;
    let ancestor: Parser.SyntaxNode | null = use;
    let unsupported = false;
    while (ancestor && ancestor.type !== "program") {
      if (
        /type|interface|import/.test(ancestor.type) ||
        ["assignment_expression", "augmented_assignment_expression", "update_expression"].includes(
          ancestor.type,
        )
      )
        unsupported = true;
      ancestor = ancestor.parent;
    }
    if (unsupported) continue;
    const key = `${reference.file}:${use.startIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const binding = reference.target_symbol_id
      ? symbols.get(reference.target_symbol_id)
      : undefined;
    if (binding && binding.kind !== "variable") continue;
    const specifier = imported
      .descendantsOfType("import_specifier")
      .find(
        (item) =>
          (item.childForFieldName("alias") ?? item.childForFieldName("name"))?.text === node.text,
      )!;
    const dependency = index.dependencies.find(
      (item) =>
        item.file === reference.file &&
        item.module_specifier === imported.childForFieldName("source")?.text.slice(1, -1),
    );
    const declaration =
      binding &&
      binding.kind === "variable" &&
      !binding.parent_id &&
      dependency?.target_file === binding.file &&
      specifier.childForFieldName("name")?.text === binding.name &&
      ["exact", "static"].includes(reference.resolution)
        ? treeFor(binding.file)
            .rootNode.descendantsOfType("variable_declarator")
            .find(
              (item) =>
                item.childForFieldName("name")?.text === binding.name &&
                item.startPosition.row + 1 === binding.range.start.line,
            )
        : undefined;
    let initializer = declaration?.childForFieldName("value");
    let valid =
      !!initializer &&
      declaration?.parent?.parent?.type === "export_statement" &&
      !/^import\s+type\b/.test(imported.text) &&
      !/^type\s/.test(specifier.text) &&
      declaration?.parent?.type === "lexical_declaration" &&
      declaration.parent.text.startsWith("const ");
    const shadowed = tree.rootNode
      .descendantsOfType([
        "variable_declarator",
        "required_parameter",
        "optional_parameter",
        "function_declaration",
        "class_declaration",
        "catch_clause",
      ])
      .some(
        (item) =>
          (
            item.childForFieldName("name") ??
            item.childForFieldName("pattern") ??
            item.childForFieldName("parameter")
          )?.text === node.text,
      );
    valid &&= !shadowed;
    if (use.type === "member_expression") {
      const property = use.childForFieldName("property")?.text;
      const fields =
        initializer?.type === "object"
          ? initializer.namedChildren.filter((item) => item.type !== "comment")
          : [];
      const matches = fields.filter(
        (item) => item.type === "pair" && item.childForFieldName("key")?.text === property,
      );
      valid &&=
        fields.length > 0 && fields.every((item) => item.type === "pair") && matches.length === 1;
      initializer = matches[0];
      if (use.parent?.type === "member_expression") valid = false;
    } else if (initializer?.type === "object") valid = false;
    const locations =
      valid && binding && declaration && initializer
        ? [
            ...linesFor(reference.file, imported),
            ...owner.lines.map((line) => ({ file: reference.file, line })),
            ...linesFor(reference.file, use),
            { file: binding.file, line: declaration.startPosition.row + 1 },
            ...linesFor(binding.file, initializer),
          ]
        : [];
    for (let parent = use.parent; parent; parent = parent.parent) {
      if (
        parent.type === "call_expression" &&
        /\.(?:register|registerAsync)$/.test(parent.childForFieldName("function")?.text ?? "")
      )
        locations.push(...linesFor(reference.file, parent.childForFieldName("function")!));
      if (parent.type === "if_statement" && parent.childForFieldName("condition"))
        locations.push(...linesFor(reference.file, parent.childForFieldName("condition")!));
    }
    contexts.push({
      requirement: `imported configuration ${use.text} provenance at ${reference.file}:${use.startPosition.row + 1}`,
      locations: valid ? locations : [],
    });
  }
  if (!contexts.length)
    contexts.push({
      requirement: "imported configuration constant/property provenance",
      locations: [],
    });
  if (request.order)
    contexts.push({
      requirement: "configuration initialization order requires parent review",
      locations: [],
    });
  return contexts;
}
