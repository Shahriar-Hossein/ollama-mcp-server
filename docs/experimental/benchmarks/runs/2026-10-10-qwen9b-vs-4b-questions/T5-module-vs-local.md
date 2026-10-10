# T5 - wrong evidence selection (module vs shadowing local, async)
Tool: local_explore_repo
Args: repository_root=/tmp/claude-1000/-home-shahriar-projects-ollama-mcp-server/97de858e-14ac-4abc-8307-b1bd7e6040b8/scratchpad/repos/py-scopes (git repo already created, 1 commit, file python/scopes.py copied from scripts/experimental/fixtures/citation-eval/source/python/scopes.py) ; limit=8 ; query:
"Which OPTIONS dictionary does process_background read, what mode does it return, and what attempts value is in that dictionary? Cite declaration, values and return."

## Original 4B outcome
runs/2026-10-09-citation-eval.md (PY-BACKGROUND, qwen-context:h-q4_0-24k): packed 5/5, retrieved range 2, SELECTED 2/5 (module OPTIONS declaration/values batch/11 omitted), incomplete, needs_review; field-feedback.md "Frozen Python cross-scope answers": emits unfinished OPTIONS[ strings, abstains on unselected attempts.

## Gold (file python/scopes.py)
L1 `OPTIONS = {` ; L2 `    "mode": "batch",` ; L3 `    "attempts": 11,` ; L15 `async def process_background():` ; L16 `    return OPTIONS["mode"]`
Answer: reads MODULE-level OPTIONS (not process_inline's local one), returns "batch", attempts 11.
Forbidden: claims it reads the local OPTIONS, returns inline, attempts 4.

## Rubric
- Pass: 5/5 gold lines selected, exact quotes, no forbidden claim.
- Partial: 3-4/5 lines, no forbidden claim (or 5/5 with a mild wording error).
- Fail: <=2/5 (4B level), or any forbidden claim.
