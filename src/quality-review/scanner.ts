import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
import TypeScript from 'tree-sitter-typescript';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, relative, sep, extname } from 'node:path';
import { execFileSync } from 'node:child_process';

export const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const functions = new Set(['function_declaration', 'generator_function_declaration', 'function_expression', 'generator_function', 'arrow_function', 'method_definition']);
const excluded = new Set(['.git', '.quality-review', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.next', '.cache', '__pycache__', 'generated']);
export function sourcePath(root: string, file: string) {
  const path = resolve(root, file);
  const rel = relative(root, path);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || rel.split(sep).includes('.quality-review')) throw new Error('Source path outside repository');
  let cursor = root;
  for (const part of rel.split(sep)) {
    cursor = resolve(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) throw new Error('Source symlinks are not supported');
  }
  if (realpathSync(path) !== path) throw new Error('Source path changed');
  return path;
}
export interface SymbolInput {
  id: string; file: string; language: string; qualified_name: string; symbol_type: string;
  start_line: number; end_line: number; content_hash: string; source: string; context: string;
}
function canonical(node: Parser.SyntaxNode): unknown {
  if (node.type === 'comment') return null;
  return node.childCount ? [node.type, ...node.children.filter(n => n.type !== 'comment').map(canonical)] : [node.type, node.text];
}
export function discover(file: string, source: string): SymbolInput[] {
  const parser = new Parser();
  const ts = /\.(ts|tsx|mts|cts)$/.test(file);
  parser.setLanguage(ts ? (file.endsWith('.tsx') ? TypeScript.tsx : TypeScript.typescript) : JavaScript);
  const tree = parser.parse(source);
  if (tree.rootNode.hasError) throw new Error(`Parse error in ${file}; scan not committed`);
  const result: SymbolInput[] = [];
  const names = new Map<string, number>();
  const context = tree.rootNode.namedChildren.filter(n => ['import_statement', 'type_alias_declaration', 'interface_declaration'].includes(n.type)).map(n => n.text).join('\n').slice(0, 4000);
  function walk(node: Parser.SyntaxNode, scope: string[]) {
    const isFunction = functions.has(node.type);
    const isClass = ['class_declaration', 'class', 'class_expression', 'internal_module'].includes(node.type);
    let name = node.childForFieldName('name')?.text;
    if (isFunction && !name && ['variable_declarator', 'pair', 'public_field_definition', 'assignment_expression'].includes(node.parent?.type ?? '')) {
      name = node.parent?.childForFieldName('name')?.text ?? node.parent?.childForFieldName('key')?.text ?? node.parent?.childForFieldName('left')?.text;
    }
    const isObject = ['variable_declarator', 'pair', 'public_field_definition'].includes(node.type) && node.childForFieldName('value')?.type === 'object';
    if (isObject) name = node.childForFieldName('name')?.text ?? node.childForFieldName('key')?.text;
    if ((isFunction || isClass || isObject) && name) {
      const qualified = [...scope, name].join('.');
      if (isFunction) {
        const index = (names.get(qualified) ?? 0) + 1;
        names.set(qualified, index);
        const qualified_name = index === 1 ? qualified : `${qualified}#${index}`;
        result.push({ id: digest(`${file}::${qualified_name}`), file, language: ts ? 'typescript' : 'javascript', qualified_name, symbol_type: node.type, start_line: node.startPosition.row + 1, end_line: node.endPosition.row + 1, content_hash: digest(JSON.stringify(canonical(node))), source: node.text, context });
      }
      scope = [...scope, name];
    }
    for (const child of node.namedChildren) walk(child, scope);
  }
  walk(tree.rootNode, []);
  return result;
}
export function readSymbols(root: string, file: string) {
  const path = sourcePath(root, file);
  const stat = lstatSync(path);
  if (!stat.isFile()) throw new Error(`Not a regular source file: ${file}`);
  if (stat.size > 2_000_000) throw new Error(`File exceeds 2 MB: ${file}`);
  return discover(file, readFileSync(path, 'utf8'));
}
export function* scanFiles(root: string, directory = root): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink() || excluded.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    const file = relative(root, path);
    // check-ignore also works for untracked paths; failure outside Git means no Git filtering.
    let ignored = false;
    try { execFileSync('git', ['check-ignore', '-q', '--', file], { cwd: root, stdio: 'ignore', timeout: 5000 }); ignored = true; } catch (error: any) { if (error.status !== 1 && error.status !== 128) throw error; }
    if (ignored) continue;
    if (entry.isDirectory()) yield* scanFiles(root, path);
    else if (entry.isFile() && ['.js','.jsx','.mjs','.cjs','.ts','.tsx','.mts','.cts'].includes(extname(file)) && !file.endsWith('.d.ts')) yield file;
  }
}
