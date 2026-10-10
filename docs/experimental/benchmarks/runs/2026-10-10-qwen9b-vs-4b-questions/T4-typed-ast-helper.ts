/*
T4 - typed AST helper (task, TypeScript)

Run 2026-10-10: tool run_ollama_task, system prompt "You are a precise TypeScript engineer. Return only TypeScript code, no fences, no prose." Prompt below is the fenced block in tests/T4.md, sent verbatim. Reconstructed from the 2026-10-09 run doc; the original raw prompt is at the end of this file.

# T4 - broken drafted code (typed AST helper with supplied interface)
Tool: run_ollama_task (timeout_ms=120000)
system_prompt: "You are a precise TypeScript engineer. Return only TypeScript code, no fences, no prose."
prompt (reconstructed from runs/2026-10-09-python-dictionary-selection.md "Second bounded piece"; original raw prompt not in repo):
```
Implement this pure function. No parser construction, no IO, no imports besides types.

interface PyNode { type: string; text: string; startRow: number; endRow: number; namedChildren: PyNode[]; childForFieldName(name: string): PyNode | null; hasError: boolean; }
export interface DictRow { row: number; keys: string[]; }  // one entry per distinct source row
export function pythonDictionaryEntryRows(dict: PyNode): DictRow[] | undefined

Spec: `dict` is a tree-sitter-python `dictionary` node. Accept one to three plain literal entries (`pair` children). Keys must be unescaped, unprefixed (no r/b/f/u), single-line string literals with UNIQUE canonical content (after removing quotes). Values must be plain strings (same plain rule) or unadorned decimal integers/floats (type `integer`/`float`, no underscores). Every pair must occupy one physical row (startRow === endRow); several pairs on the same row yield ONE DictRow for that row (deduplicate rows, keys list in source order). Any unsupported entry (spread `dictionary_splat`, comprehension, nested container, duplicate canonical key, multi-line pair, prefixed/escaped string, node.hasError, 0 or more than 3 pairs) makes the WHOLE dictionary return undefined. Validate ALL pairs before returning anything. Return rows sorted by row.
```

## Original 4B outcome
field-feedback.md 2026-10-09 "Python dictionary literal entry rows": undefined `node`, missing closing brace, early return inside key loop before validating later keys, no canonical-duplicate / single-row / complete-plain-string checks, rejected repeated rows instead of deduping; not executed (13,914 ms); Sol repaired.

## Rubric (typecheck with tsc --strict on the output, then reason/mock a PyNode)
Gold checks: (1) compiles under strict; (2) single loop validates every pair before return; (3) duplicate canonical keys ("a" and 'a') -> undefined; (4) same-row pairs deduped to one DictRow; (5) any bad entry anywhere rejects whole dict; (6) pair count 1..3 enforced; (7) hasError/multi-line rejected.
- Pass: compiles and >=6/7 checks hold. Partial: compiles, 4-5/7. Fail: does not compile or <=3/7.

## 2026-10-09 raw draft prompt (verbatim, benchmark-data; not the 2026-10-10 prompt)
system: none recorded. Source: benchmark-data/language-eval/python-dictionary-development/local-entry-draft.json

```
Return JSON {"body":"TypeScript function body only"}. No imports/signature/markdown. JSON encodes code text; decoded body must contain normal TypeScript regex escapes, not doubled regex-source escapes.

export function pythonDictionaryEntryRows(dictionary: Parser.SyntaxNode): number[] | null { YOUR_BODY }

Already supplied Parser.SyntaxNode fields:
type:string, text:string, hasError:boolean, isMissing:boolean,
startPosition:{row:number,column:number}, endPosition:{row:number,column:number},
namedChildren:SyntaxNode[], childForFieldName(name:string):SyntaxNode|null.
Rows are zero-based. Return one-based source rows, stable first-seen and deduped.

Contract:
- Accept only a valid dictionary node: type "dictionary", !hasError, !isMissing.
- Its namedChildren (ignoring type "comment") must contain 1..3 entries, all type "pair".
- Each pair must !hasError and !isMissing, start/end on same row.
- Fields "key" and "value" must exist and !hasError,!isMissing.
- Key must type "string", single-line unprefixed single- or double-quoted literal with NO internal quotes of same kind, backslash, CR or LF. Strip ONLY the first/last quote for canonical key. Reject duplicate canonical keys (single vs double quotes for same key also duplicates).
- Value may the same plain string form, OR type "integer"/"float" with unadorned decimal text (digits; optional decimal point or exponent e/E; no sign, underscore, hex, imaginary suffix). Unary operators, booleans, None, nested containers, f/byte/raw/prefixed strings, calls, concatenated strings and unpacking are unsupported.
- For strings reject ANY named child type "interpolation" or "escape_sequence"; lexical plain-string check must cover triple/prefixed literals too.
- If any condition fails return null for entire dictionary. Do not return partial entries.
- Valid return rows are pair.startPosition.row+1, deduped in source order.
No IO, parser construction, imports, arbitrary evaluation or other changes. Keep body <35 lines.
Examples of canonical keys: 'mode' and "mode" both canonical "mode". Escape sequences unsupported to avoid aliasing.

```
*/
