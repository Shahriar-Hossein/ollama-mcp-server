import type Parser from "tree-sitter";
import type { SourcePosition, SourceRange } from "./indexer.js";

/** Maps Node parser UTF-16 offsets to public UTF-8 byte offsets. */
export class SourceOffsets {
  private readonly bytes: number[] = [];

  constructor(source: string) {
    let index = 0;
    let byte = 0;
    for (const character of source) {
      for (let part = 0; part < character.length; part++) this.bytes[index + part] = byte;
      index += character.length;
      byte += Buffer.byteLength(character);
    }
    this.bytes[index] = byte;
  }

  toByte(index: number): number {
    return this.bytes[index];
  }

  toIndex(byte: number): number {
    let low = 0;
    let high = this.bytes.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (this.bytes[middle] < byte) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  normalizeRanges(ranges: SourceRange[]): void {
    const seen = new Set<SourcePosition>();
    for (const range of ranges) {
      for (const position of [range.start, range.end]) {
        if (seen.has(position)) continue;
        seen.add(position);
        position.column =
          this.toByte(position.byte) - this.toByte(position.byte - position.column + 1) + 1;
        position.byte = this.toByte(position.byte);
      }
    }
  }
}

const treeOffsets = new WeakMap<Parser.Tree, SourceOffsets>();

export function offsetsForTree(tree: Parser.Tree): SourceOffsets {
  let offsets = treeOffsets.get(tree);
  if (!offsets) {
    offsets = new SourceOffsets(tree.rootNode.text);
    treeOffsets.set(tree, offsets);
  }
  return offsets;
}

export function nodeForRange(tree: Parser.Tree, range: SourceRange): Parser.SyntaxNode {
  const offsets = offsetsForTree(tree);
  return tree.rootNode.descendantForIndex(
    offsets.toIndex(range.start.byte),
    offsets.toIndex(range.end.byte),
  );
}
