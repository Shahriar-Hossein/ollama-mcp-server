# T7 - HARD PASS: shadowed-scope evidence (4B passed 5/5)
Tool: local_explore_repo
Args: repository_root=/tmp/claude-1000/-home-shahriar-projects-ollama-mcp-server/97de858e-14ac-4abc-8307-b1bd7e6040b8/scratchpad/repos/py-scopes ; limit=8 ; query:
"Which OPTIONS dictionary does process_inline read, what mode does it return, and what attempts value is in that dictionary? Cite declaration, values and return."

## Original 4B outcome
runs/2026-10-09-citation-eval.md (PY-INLINE, qwen-context:h-q4_0-24k): packed 5/5, selected 5/5, complete answer (mildly imprecise key/value wording), 19.8 s scout. Run is the contrast to T5 (same file, module vs shadowing local).

## Gold (python/scopes.py)
L7 `def process_inline():` ; L8 `    OPTIONS = {` ; L9 `        "mode": "inline",` ; L10 `        "attempts": 4,` ; L12 `    return OPTIONS["mode"]`
Answer: reads the LOCAL OPTIONS (shadows module one), returns "inline", attempts 4. Forbidden: module OPTIONS, batch, 11.

## Rubric
Pass: 5/5 lines, exact quotes, no forbidden claim. Partial: 3-4/5 or minor wording. Fail: <=2/5 or any forbidden claim (e.g. picks module L1-3).
