import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import TypeScript from "tree-sitter-typescript";
import { parseSource } from "../../explorer/parse.js";
import { configurationKeys, selectableEvidenceText } from "./local-explore-validation.js";

export function configurationContextRequests(question: string) {
  const configuration =
    configurationKeys(question).length > 0 || /configur|settings?/i.test(question);
  return {
    initialization: configuration && /initializ|\bload\w*\b|\.env\b/i.test(question),
    provider: configuration && /provider|provenance|inject|\bsuppl\w*\b/i.test(question),
  };
}

type Context = { requirement: string; lines: number[] };
const callableTypes = new Set([
  "function_declaration",
  "function_expression",
  "arrow_function",
  "method_definition",
  "generator_function",
  "generator_function_declaration",
]);

export function parseConfigurationContexts(source: string, file: string, question: string) {
  const parser = new Parser();
  parser.setLanguage(
    /\.[cm]?tsx?$/.test(file)
      ? file.endsWith(".tsx")
        ? TypeScript.tsx
        : TypeScript.typescript
      : JavaScript,
  );
  return configurationContexts(parseSource(parser, source), file, question);
}

// These are source context obligations, not a resolution of the dependency container.
export function configurationContexts(
  tree: Parser.Tree,
  file: string,
  question: string,
): Context[] {
  const requested = configurationContextRequests(question);
  if (!requested.initialization && !requested.provider) return [];
  const source = tree.rootNode.text.split("\n");
  const linesFor = (node: Parser.SyntaxNode) => {
    const lines: number[] = [];
    for (let row = node.startPosition.row; row <= node.endPosition.row; row++) {
      const text = source[row]?.trim();
      if (text && selectableEvidenceText(text) && !/^(?:[{}();,]+$|\/\/|\*|\/\*)/.test(text))
        lines.push(row + 1);
    }
    return lines;
  };
  const contexts: Context[] = [];
  if (requested.initialization) {
    const imports = tree.rootNode
      .descendantsOfType("import_statement")
      .filter((node) => node.childForFieldName("source")?.text.slice(1, -1) === "@nestjs/config");
    for (const imported of imports) {
      for (const specifier of imported.descendantsOfType("import_specifier")) {
        if (specifier.childForFieldName("name")?.text !== "ConfigModule") continue;
        const name = specifier.childForFieldName("alias")?.text ?? "ConfigModule";
        for (const call of tree.rootNode.descendantsOfType("call_expression")) {
          if (
            ![`${name}.forRoot`, `${name}.forRootAsync`].includes(
              call.childForFieldName("function")?.text ?? "",
            )
          )
            continue;
          // A same-name local binding makes the imported identity ambiguous.
          const shadowed = tree.rootNode
            .descendantsOfType([
              "variable_declarator",
              "required_parameter",
              "optional_parameter",
              "function_declaration",
              "class_declaration",
            ])
            .some(
              (node) =>
                node.childForFieldName("name")?.text === name ||
                node.childForFieldName("pattern")?.text === name,
            );
          contexts.push({
            requirement: `configuration initialization context at ${file}:${call.startPosition.row + 1}`,
            lines: shadowed ? [] : [...linesFor(imported), ...linesFor(call)],
          });
        }
      }
    }
  }
  if (requested.provider) {
    const keys = configurationKeys(question);
    const seen = new Set<number>();
    for (const read of tree.rootNode.descendantsOfType("call_expression")) {
      const callee = read.childForFieldName("function");
      const key = read.childForFieldName("arguments")?.namedChildren[0];
      if (
        callee?.type !== "member_expression" ||
        !["get", "getOrThrow"].includes(callee.childForFieldName("property")?.text ?? "") ||
        key?.type !== "string" ||
        !keys.includes(key.text.slice(1, -1))
      )
        continue;
      let owner = read.parent;
      while (owner && !callableTypes.has(owner.type)) owner = owner.parent;
      if (!owner || seen.has(owner.id)) continue;
      seen.add(owner.id);
      const pair = owner.parent;
      const object = pair?.parent;
      if (
        pair?.type !== "pair" ||
        pair.childForFieldName("key")?.text !== "useFactory" ||
        object?.type !== "object"
      ) {
        if (owner.type !== "method_definition") continue;
        const receiver = callee.childForFieldName("object")?.text;
        let classNode = owner.parent;
        while (classNode && !["class_declaration", "class"].includes(classNode.type))
          classNode = classNode.parent;
        const constructorNode = classNode
          ?.childForFieldName("body")
          ?.namedChildren.find(
            (node) =>
              node.type === "method_definition" &&
              node.childForFieldName("name")?.text === "constructor",
          );
        const parameters = constructorNode?.childForFieldName("parameters");
        const name = receiver?.replace(/^this\./, "");
        const parameter = parameters?.namedChildren.find(
          (node) => node.childForFieldName("pattern")?.text === name,
        );
        const direct = receiver?.startsWith("this.")
          ? parameter?.namedChildren.some((node) => node.type === "accessibility_modifier") ||
            /\breadonly\b/.test(parameter?.text ?? "")
          : owner.childForFieldName("name")?.text === "constructor";
        contexts.push({
          requirement: `${key.text.slice(1, -1)} constructor injection context at ${file}:${read.startPosition.row + 1}`,
          lines: parameter && direct ? [...linesFor(parameter), ...linesFor(read)] : [],
        });
        continue;
      }
      const fields = object.namedChildren.filter((node) => node.type !== "comment");
      const single = (name: string) => {
        const matches = fields.filter(
          (field) => field.type === "pair" && field.childForFieldName("key")?.text === name,
        );
        return matches.length === 1 ? matches[0] : undefined;
      };
      const inject = single("inject");
      const provide = single("provide");
      const parameters = owner.childForFieldName("parameters");
      const receiver = callee.childForFieldName("object")?.text;
      const parameterIndex =
        parameters?.namedChildren.findIndex(
          (parameter) => (parameter.childForFieldName("pattern") ?? parameter).text === receiver,
        ) ?? -1;
      const token = inject?.childForFieldName("value")?.namedChildren[parameterIndex];
      const shadowed = owner
        .descendantsOfType("variable_declarator")
        .some((node) => node.childForFieldName("name")?.text === receiver);
      const valid =
        fields.every((field) => field.type === "pair") &&
        single("useFactory") &&
        inject?.childForFieldName("value")?.type === "array" &&
        parameterIndex >= 0 &&
        !shadowed &&
        token &&
        ["identifier", "string", "member_expression"].includes(token.type) &&
        !inject
          .childForFieldName("value")
          ?.namedChildren.some((node) => node.type === "spread_element") &&
        provide &&
        parameters;
      contexts.push({
        requirement: `${key.text.slice(1, -1)} provider factory context at ${file}:${owner.startPosition.row + 1}`,
        lines: valid
          ? [
              ...linesFor(provide!),
              ...linesFor(inject!),
              ...linesFor(parameters!),
              ...linesFor(read),
            ]
          : [],
      });
    }
  }
  return contexts;
}
