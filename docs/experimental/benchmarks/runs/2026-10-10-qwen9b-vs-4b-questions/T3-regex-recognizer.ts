/*
T3 - regex question recognizer (task, TypeScript)

Run 2026-10-10: tool run_ollama_task, system prompt "You are a precise TypeScript engineer. Return only the function body or function, no Markdown fences, no prose." Prompt below is the fenced block in tests/T3.md, which the harness sent verbatim. It was reconstructed from the 2026-10-09 run doc, so it differs from the original raw prompt at the end of this file.

# T3 - broken drafted code (regex recognizer, body-only)
Tool: run_ollama_task (default model; add timeout_ms=120000)
system_prompt: "You are a precise TypeScript engineer. Return only the function body or function, no Markdown fences, no prose."
prompt (verbatim, reconstructed from runs/2026-10-09-python-dictionary-selection.md "First bounded piece"; original raw prompt not saved in repo):
```
Write a pure TypeScript function:

export function pythonDictionaryRequest(question: string): { dictionaryName: string; functionName: string } | undefined

It recognizes exactly one unquoted phrase of the form `Which NAME dictionary does FUNCTION read` inside the question, where NAME and FUNCTION are ASCII identifiers matching [A-Za-z_][A-Za-z0-9_]*. Rules:
- Case of NAME and FUNCTION is preserved (the words Which/dictionary/does/read match case-sensitively as written).
- Return undefined if the phrase appears zero times or more than once (count all matches globally; duplicate requests are rejected).
- Reject qualified names (e.g. `a.b`), quoted names (`"OPTIONS"` or 'OPTIONS'), numeric-leading names (`2fast`), hyphenated names (`my-dict`), and the form `reading` instead of `read` (e.g. "does f reading").
- Must not match when NAME or FUNCTION is only a partial token of a longer non-identifier string.
- Do not inspect any source code. No imports, no IO.
Return only the function.
```

## Original 4B outcome
field-feedback.md 2026-10-09 "Python dictionary question recognizer" + selection.md: draft doubled regex escapes, omitted dictionary capture, confused match-array length with request count, used invalid capture indexes without null guard; not executed; Sol repaired (11,239 ms).

## Rubric (execute: strip fences, compile with `node --import tsx`, run cases)
Positive: "Which OPTIONS dictionary does process_inline read, what mode?" -> {dictionaryName:"OPTIONS",functionName:"process_inline"}; "Which batch_cfg dictionary does Run read" -> case preserved.
Negative (all undefined): two phrases in one question; `Which "OPTIONS" dictionary does f read`; `Which a.b dictionary does f read`; `Which my-dict dictionary does f read`; `Which 2x dictionary does f read`; `Which OPTIONS dictionary does f reading`; no phrase.
- Pass: compiles, all 2 positive + 7 negative correct.
- Partial: compiles, positives right, 1-2 negatives wrong.
- Fail: syntax/type error, wrong escapes (e.g. `\\s` doubled), missing capture, or >=3 cases wrong.

## 2026-10-09 raw draft prompt (verbatim, benchmark-data; not the 2026-10-10 prompt)
system: none recorded. Source: benchmark-data/language-eval/python-dictionary-development/local-request-draft.json

```
Return JSON {"body":"function body only"} for this exact TypeScript function. Do not write imports/signature/markdown. Keep the body under 20 lines.

export function pythonDictionaryRequest(query:string):{dictionary:string;reader:string}|null { YOUR_BODY }

Recognize EXACTLY one unquoted phrase of the form:
"Which NAME dictionary does FUNCTION read"
Names are case-sensitive ASCII Python identifiers [A-Za-z_][A-Za-z0-9_]*; prose Which/dictionary/does/read is case-insensitive.
The phrase can be followed by comma, ?, whitespace, or end. "reading" is not "read".
Keep identifier spelling/case unchanged.
Multiple matching phrases return null, even duplicates.
Qualified names (settings.OPTIONS or pkg.reader), quoted/backtick names, numeric/hyphenated names are unsupported and must NOT partially match.
Other query text may precede/follow the phrase.
Examples:
"Which OPTIONS dictionary does process_background read, what mode does it return?" => {dictionary:"OPTIONS",reader:"process_background"}
"which Queue_Config dictionary DOES do_work read?" => {dictionary:"Queue_Config",reader:"do_work"}
"Which pkg.OPTIONS dictionary does process_background read?" => null
"Which OPTIONS dictionary does pkg.process_background read?" => null
"Which OPTIONS dictionary does do_work reading?" => null
"Which OPTIONS dictionary does one read and Which OPTIONS dictionary does two read?" => null
Unsupported or no match => null.
No IO or dependencies. This parses explicit question text, not source or binding.

```
*/
