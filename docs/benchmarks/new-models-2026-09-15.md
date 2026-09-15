# New models, 2026-09-15 — think:false only

## think:true, 16K/16K, survivors only (post exaone-deep removal)

`exaone-deep:7.8b` was removed after the think:false rerun below (worst
correctness and worst wall time of the series — see its regression note).
This pass tries `think:true` on the four remaining tags, same fixture, same
`num_ctx:16384`/`num_predict:16384`, `temperature 0`, `seed 42`,
`keep_alive:2m`, GPU idle (326 MiB) before the run started.

**`nemotron-mini:4b` and `gemma3:4b` both reject `think:true` outright** —
`/api/generate` returned `{"error":"\"<model>\" does not support thinking"}`
immediately (wall ~10ms, no VRAM load). Neither tag exposes a thinking mode;
`think:true` is not just a no-op for them, it's a hard error. Don't route
either through a `think:true` path.

For the two tags that do support it, correctness was unchanged from their
`think:false` runs — `think:true` bought nothing but latency:

| Model | Extract | Fix | Summary (words) | Wall: extract / fix / summary | thinking chars: extract/fix/summary |
|---|---|---:|---|---:|---:|
| gemma4:e2b | PASS | 3/6 (same cases) | 80 PASS (no caveat) | 7.2s / 19.3s / 5.6s | 0 / 6206 / 1657 |
| nemotron-3-nano:4b | FAIL (same trap) | 2/6 (same cases) | 61 PASS (**caveat present**) | 46.4s / 30.6s / 37.2s | 1774 / 1910 / 1971 |

Both scored identically to their `think:false` runs on extract and fix (same
pass/fail pattern, same failing cases) — `think:true` changed nothing about
correctness. `gemma4:e2b`'s `extract` call did zero thinking despite
`think:true` (0 thinking chars, same PASS as before) — it emitted the answer
directly. Wall time got worse across the board versus the `think:false`
16K rerun (e.g. nemotron-3-nano's `extract` went from 16.9s to 46.4s,
`summary` from 7.3s to 37.2s) for no correctness gain. One upside:
nemotron-3-nano's summary picked up the rollback-failure caveat this time
(missing in its think:false run) — but that's a single data point, not
confirmed as a `think:true` effect.

**Verdict: `think:true` is not worth it for any of these four tags.** Two
error out entirely, and the two that work pay a large latency tax (2-5x) for
no measured correctness improvement. Stick with `think:false` for this
model set.

## Rerun: uniform 16K/16K, survivors only

Most of the large tags from the original nine-model pull were removed after
the first pass (`deepseek-r1:8b`, `ministral-3:8b`, `lfm2.5:8b`,
`deepseek-r1:7b` are no longer installed). This rerun covers the five
survivors at a uniform `num_ctx:16384` / `num_predict:16384`, `think:false`
— the original run split context by installed size (8K for tags over 4 GB)
to probe GPU spillover; this pass drops that split since it's no longer the
open question. Same [fixture](../BENCHMARKS.md#the-fixture), `temperature 0`,
`seed 42`, `keep_alive:2m`, GPU idle (333 MiB) before the run started.

| Model | ctx (requested) | ctx (actual) | Extract | Fix | Summary (words) | Wall: extract / fix / summary |
|---|---:|---:|---|---:|---|---:|
| gemma4:e2b | 16K | 16384 | PASS | 3/6 | 79 PASS (no caveat) | 9.5s / 16.5s / 1.4s |
| gemma3:4b | 16K | 16384 | FAIL | 3/6 | 86 PASS (no caveat) | 12.4s / 3.5s / 2.2s |
| nemotron-3-nano:4b | 16K | 16384 | FAIL | 2/6 | 83 PASS (no caveat) | 16.9s / 4.6s / 7.3s |
| exaone-deep:7.8b | 16K | 16384 | PASS | **2/6** | 75 PASS (no caveat) | 103.6s / 321.0s / 86.1s |
| nemotron-mini:4b | 16K | 4096\* | FAIL | 0/6 (prose, not code) | 39 PASS (caveat OK) | 17.8s / 2.9s / 1.1s |

\* Same as the original run: `nemotron-mini:4b` silently caps at `CONTEXT
4096` regardless of the requested `num_ctx:16384` — confirmed again on a
second, independent run. Treat this as a hard property of the tag, not a
one-off.

None of these five beat the existing routes (see the master doc's
recommendation table).

### exaone-deep:7.8b regressed on `fix` at the larger context

This is the most notable result of the rerun. At `8K ctx` in the original
pass, `exaone-deep:7.8b` was the only `think:false`-tagged model besides
`ministral-3:3b` to solve `fix` 6/6. At `16K ctx`, same prompt, same seed,
same temperature, it drops to **2/6** — and it's not truncation (`done_reason:
stop`, `eval_count:5219`, well under the 16384 budget). The generated function
changed shape entirely: it now destructures `{ id, row: currentRow }` from
each input row, but the fixture's rows are `{id, value}` — there's no `row`
field, so every returned object silently carries `row: undefined`. That's a
different bug from the original series' recurring Map-insertion-order issue.
Combined with its cost (321s for `fix` alone, 74-181s per task in the
original run), this closes the door on `exaone-deep:7.8b` as a candidate
regardless of context budget — worse correctness *and* the worst wall time
in either series.

### GPU residency — caveat on this run's numbers

`keep_alive:2m` combined with the ~2-3 min gap between model dirs meant one
overlap: `gemma4:e2b` was still resident when `nemotron-3-nano:4b`'s tasks
started, so both shared the GPU during that dir's run (`ollama ps` showed
both loaded, `56%/44% CPU/GPU` for nemotron-3-nano). That's worse residency
than nemotron-3-nano would get alone — the original 16K series measured it
at 100% GPU, 3,380 MiB, with nothing else resident. Don't read this run's
nemotron-3-nano processor split as the tag's standalone footprint; the
correctness/wall-time numbers above are unaffected (they're per-request, not
shared-GPU artifacts), but the GPU table below should be read with that in
mind.

| Model | Peak VRAM (session) | `ollama ps` residency, own tasks |
|---|---:|---|
| exaone-deep:7.8b | 4,804 MiB | 26%/74% CPU/GPU |
| gemma4:e2b | 4,697 MiB | 100% GPU |
| nemotron-3-nano:4b | 4,685 MiB\* | 56%/44% CPU/GPU\* |
| nemotron-mini:4b | 4,678 MiB | 100% GPU (4K ctx) |
| gemma3:4b | 4,052 MiB | 100% GPU |

\* Contaminated by the `gemma4:e2b` overlap above — not a clean solo
measurement.

`exaone-deep:7.8b` is still the only tag here that spills to CPU on its own
merits (74% GPU even without contention), consistent with the original
finding that model size, not context budget, decides residency on this card
above ~4-5 GB of weights.

## Per-case fix breakdown, this rerun

| Model | empty | last-occ-order | distinct-order | special-ids | int-like-ids | repeated-one |
|---|---|---|---|---|---|---|
| gemma4:e2b | P | **F** | P | **F** | P | **F** |
| gemma3:4b | P | **F** | P | **F** | P | **F** |
| nemotron-3-nano:4b | P | **F** | **F** | **F** | P | **F** |
| exaone-deep:7.8b | P | **F** | **F** | **F** | P | **F** |
| nemotron-mini:4b | ERR | ERR | ERR | ERR | ERR | ERR |

Same recurring Map-insertion-order bug (first occurrence, not last) accounts
for most partial-credit failures, matching the original series.
`nemotron-mini:4b` throws on every case — its output is prose with a fenced
code block, and the grader's fence-stripping leaves trailing explanatory text
attached to the code, so nothing parses. That's the same "prose instead of
code" failure mode documented in the original run, not a new bug.

## Original run (superseded models retained for history)

The original nine-model, mixed-8K/16K pass is preserved below since it
includes tags no longer installed (`deepseek-r1:8b`, `ministral-3:8b`,
`lfm2.5:8b`, `deepseek-r1:7b`) and the per-case/GPU detail behind their
scores.

| Model | ctx | Extract | Fix | Summary (words) | Wall: extract / fix / summary |
|---|---:|---|---:|---|---:|
| **exaone-deep:7.8b** | 8K | FAIL | **6/6** | 87 FAIL (no caveat) | 74.7s / 180.8s / 66.9s |
| deepseek-r1:8b | 8K | PASS | 5/6 | 109 FAIL (caveat OK) | 174.8s / 311.6s / 19.5s |
| gemma4:e2b | 8K | PASS | 3/6 | 79 PASS (no caveat) | 17.7s / 16.8s / 1.5s |
| ministral-3:8b | 8K | PASS | 3/6 | 71 PASS (no caveat) | 21.0s / 7.9s / 8.3s |
| gemma3:4b | 16K | FAIL | 3/6 | 86 PASS (no caveat) | 24.4s / 3.4s / 2.2s |
| nemotron-3-nano:4b | 16K | FAIL | 2/6 | 83 PASS (no caveat) | 16.0s / 1.9s / 2.6s |
| lfm2.5:8b | 8K | FAIL | 1/6 | 92 FAIL (caveat OK) | 27.6s / 9.4s / 15.3s |
| nemotron-mini:4b | 16K\* | FAIL | 0/6 (prose, not code) | 39 PASS (caveat OK) | 9.3s / 2.8s / 1.1s |
| deepseek-r1:7b | 8K | FAIL | 0/6 (prose, not code) | 104 FAIL (caveat OK) | 47.1s / 157.0s / 15.4s |

\* Requested `num_ctx:16384`, but `ollama ps` reported the session capped at
`CONTEXT 4096` throughout — this tag silently ignores a context request above
its trained/configured max. Don't assume a requested `num_ctx` was honored;
check `ollama ps` while the model is resident.

**`exaone-deep:7.8b` was the second `think:false`-tagged model (after
`ministral-3:3b`) to solve `fix` 6/6 at 8K context** — but it isn't really
`think:false` in practice: it reasons inline as `<thought>…</thought>` before
answering (same pattern as `granite4.2:3b`'s `<think>` and both
`deepseek-r1` tags), so `think:false` did nothing to suppress its reasoning,
only to relabel it. See above: this 6/6 result did not reproduce at 16K
context, so the finding is now moot either way.

**`gemma4:e2b`'s installed pull is 7.2 GB but its resident footprint was only
1.7 GB** (`ollama ps` `SIZE` column) — it never spilled off GPU despite being
grouped with the "over 4 GB" cohort by download size. Tag size on disk isn't
a proxy for VRAM footprint for this model; check `ollama ps` before assuming
a large pull needs the reduced-context treatment.

Per-case fix breakdown for the models that partially passed:

| Model | empty | last-occ-order | distinct-order | special-ids | int-like-ids | repeated-one |
|---|---|---|---|---|---|---|
| exaone-deep:7.8b | P | P | P | P | P | P |
| deepseek-r1:8b | P | P | P | **F** | P | P |
| gemma4:e2b | P | **F** | P | **F** | P | P |
| ministral-3:8b | P | **F** | P | **F** | P | P |
| gemma3:4b | P | **F** | P | **F** | P | P |
| nemotron-3-nano:4b | P | **F** | **F** | **F** | P | **F** |
| lfm2.5:8b | P | ERR | ERR | ERR | ERR | ERR |

Same recurring bug as the original series (Map-insertion order instead of
last-occurrence order) accounts for every partial score except
`nemotron-3-nano:4b`, which additionally fails `repeated-one` — a simpler
case the other partial-credit models all get right.

`lfm2.5:8b` threw on every case but `empty`: it built `lastPos` as a plain
object (`{}`) but then called `.get()` on it — a `Map`-only method — inside
the filter, so every non-empty input threw `lastPos.get is not a function`.

**`nemotron-mini:4b` and `deepseek-r1:7b` both failed `fix` at 0/6 for the
same reason**: prose instead of code. `nemotron-mini:4b` prefixes the fenced
function with `"Here's the corrected implementation..."`; `deepseek-r1:7b`
emitted a full `### Approach` / `### Solution` markdown writeup after its
`</think>` block instead of a bare function. Both ignored the "no markdown or
explanation" instruction outright.

Extract failures: `gemma3:4b`, `nemotron-3-nano:4b`, `nemotron-mini:4b`, and
`deepseek-r1:7b` all included the decoy `INFO...BOOT` record and/or the WARN
line — a *different* trap than the original series' decoy (which was about a
request_id embedded in message text), and one none of these four caught.
`exaone-deep:7.8b` made the original series' mistake: returned 4 records
including the INFO/BOOT line, in a structurally correct shape otherwise.
`lfm2.5:8b` and `deepseek-r1:7b` both leaked the message field or its content
into `request_id`.

### GPU, original run

GTX 1660 Super, 6,144 MiB total, idle before each run (~350-480 MiB).

| Model | ctx | Peak VRAM | `ollama ps` residency |
|---|---:|---:|---|
| nemotron-3-nano:4b | 16K | 3,380 MiB | 100% GPU |
| nemotron-mini:4b | 4K (capped) | 3,377 MiB | 100% GPU |
| gemma3:4b | 16K | 4,108 MiB | 100% GPU |
| gemma4:e2b | 8K | 4,698 MiB | 100% GPU |
| ministral-3:8b | 8K | 4,589 MiB | **47%/53% CPU/GPU** |
| lfm2.5:8b | 8K | 4,717 MiB | **15%/85% CPU/GPU** |
| exaone-deep:7.8b | 8K | 4,719 MiB | **19%/81% CPU/GPU** |
| deepseek-r1:7b | 8K | 4,788 MiB | **16%/84% CPU/GPU** |
| deepseek-r1:8b | 8K | 4,914 MiB | **25%/75% CPU/GPU** |

Dropping to 8K context did not buy full GPU residency for any tag over 4 GB
installed size — every one of the six spilled to CPU, and the spillover
tracked with wall time. This confirmed the >4B-spills-regardless finding from
the 32K series, now down to 8K context — on this card, model size (not
context budget) is what decides GPU residency for anything above roughly 4-5
GB of weights. The 16K rerun above confirms the same holds at 16K ctx for
`exaone-deep:7.8b`, the one surviving tag over that size threshold.
