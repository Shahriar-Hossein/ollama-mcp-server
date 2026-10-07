import type Parser from "tree-sitter";

// node tree-sitter throws "Invalid argument" on sources over its 32768 default buffer.
export function parseSource(parser: Parser, source: string) {
  return parser.parse(source, undefined, { bufferSize: Math.max(32_768, source.length + 1) });
}
