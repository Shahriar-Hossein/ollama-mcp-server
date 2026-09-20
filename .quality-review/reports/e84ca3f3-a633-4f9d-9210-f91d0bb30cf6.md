# runRead

Review: e84ca3f3-a633-4f9d-9210-f91d0bb30cf6
File: src/tools/local-explorer-task.ts
Lines: 200-226
Hash: 29f886addcf090dd8bf1d929e4b85a4d4d6e85acbe6f4c550fea120fc228da16
Model: qwen3.5:4b
Date: 2026-09-20T03:12:54.179Z
Severity: high
Confidence: high

## Incorrect file path resolution causing 'path escapes repo root' false positives or security bypasses

The function `runRead` relies on `resolveWithinRoot` to reject paths escaping the repository root. However, standard Node.js `path.resolve` behavior combined with the specific logic in `resolveWithinRoot` (which is likely implemented via `join` internally) can lead to false positives (valid paths rejected due to directory traversal checks failing) or security bypasses if relative paths are constructed carefully. Additionally, the use of `readFileSync` on arbitrary strings without validation against a whitelist of allowed paths is risky.

## Issues

- **other**: The logic `if (full === null) return "(refused: path escapes repo root)";` depends heavily on the implementation of `resolveWithinRoot`. In Node.js, `path.resolve('/repo/root', '../../etc')` resolves to `/etc`, but `path.join` or custom resolve functions might behave differently if not using absolute paths correctly. If the input `path` is a relative path like `../secret.txt` from a subfolder, standard resolution usually handles it, but if `resolveWithinRoot` uses `join` incorrectly (e.g., missing leading slash for absolute checks), it might incorrectly flag valid reads as escaping.

  Relying solely on a resolved string being null is brittle. A robust solution must explicitly check if the resolved absolute path starts with the expected root directory prefix (case-insensitive). The current approach assumes `resolveWithinRoot` returns `null` for any escape, which may not be true if the implementation has edge cases.

  Suggested change: // Replace resolveWithinRoot logic or add a safety check
const rootDir = resolve(root);
const full = resolve(root, path);
if (full.startsWith(rootDir + '\\') || full.startsWith(rootDir + '/')) {
  // This ensures we only allow paths inside the repo root, regardless of how resolve behaves
} else {
  return "(refused: path escapes repo root)";
}

- **other**: Performance issue: The `filesRead` check is done with a `Set`. While O(1), the code adds to the set immediately before reading, but checks against it first. More critically, there is no cap on the *size* of the `filesRead` Set itself, only the count `maxFilesRead`. If an attacker or logic repeatedly triggers this function with non-matching paths, the Set could grow unbounded until memory exhaustion, rather than failing fast at `maxFilesRead`.

  The check `if (filesRead.size >= maxFilesRead && !filesRead.has(path))` is correct in intent, but the lack of explicit cleanup or size enforcement means the side effect (growing the set) can exceed the input parameter's limit if `maxFilesRead` is not actually bounded by system resources elsewhere. It should be `if (filesRead.size >= maxFilesRead)` regardless of whether the current path is in there, because if the budget is full, you shouldn't read anything.

  Suggested change: if (filesRead.size >= maxFilesRead) {
  return `(refused: file-read budget of ${maxFilesRead} exhausted)`;
} // No need to check !has here, just cap the total count

- **other**: Missing error handling for `readFileSync`: The code catches all errors but does not distinguish between IO errors (file not found, permission denied) and potential process execution issues. If `resolveWithinRoot` or the path logic fails later, it's also wrapped here. However, the biggest issue is that `e.message` might not exist on every error type if strict typing isn't perfect, leading to malformed strings.

  While `catch (e: any)` covers everything, the resulting string format relies on `e.message`. If a custom Node.js error doesn't have a message property or throws an internal error without one, the output `(read error: undefined)` is confusing. Also, if `full` points to a non-existent file that isn't in the repo (and thus rejected by `resolveWithinRoot`), this branch might still be reached if the check fails silently.

  Suggested change:   } catch (e: any) {
    const msg = typeof e.message === 'string' ? e.message : String(e);
    return `(read error: ${msg})`;
  }
}

- **other**: Deep nesting and lack of separation of concerns: The function mixes path resolution, budget checking, file I/O, line slicing, formatting, and truncation. While short enough to be one function, the logic for `lines` manipulation is buried deep inside the `try` block.

  This makes debugging harder if something goes wrong with line indexing vs max chars. It's easier to reason about if path logic and text processing are slightly separated.

  Suggested change:   const content = readFileSync(full, "utf8");
  const lines = content.split("\n");

  // Slice if needed
  let startIdx = (startLine || 1) - 1;
  if (endLine !== undefined) {
    const endIdx = endLine; // inclusive?
    // Logic depends on slice semantics. current: slices up to endLine.
    // Assuming endLine is exclusive or inclusive? Usually slice(start, end).
    // If user asks for lines 1-5 (inclusive), slice(0, 5) gives indices 0..4 (lines 1..5).
    // Current code: lines.slice((startLine||1)-1, endLine || lines.length)
    // If endLine is 5, it slices up to index 5 (exclusive) -> lines 1,2,3,4. 
    // This seems correct for "end line" being exclusive in terms of count? Or inclusive?
    // Usually 'line 5' means index 4. If user wants exactly 5 lines starting at L, they might expect endLine to be L+1.
    // Let's assume current logic is intended as: startIdx = start-1, endSlice = endLine (exclusive).
    if (startIdx >= 0) {
      const maxEnd = Math.min(endIdx || lines.length, lines.length);
      if (startIdx < maxEnd) {
        lines = lines.slice(startIdx, maxEnd);
      }
    } else {
      // Handle startLine=1 correctly
      lines = lines.slice(startIdx, endIdx || lines.length);
    }
  }
  // ... rest of logic

- **other**: Uncertainty on line slicing behavior: The code `lines.slice((startLine || 1) - 1, endLine || lines.length)` assumes `endLine` acts as an exclusive upper bound index. If the user requests `endLine=5`, does it include line 5 or stop before it? In typical CLI tools, 'lines 1-5' includes 5. Here, if input is 1..5, slice(0, 5) returns indices 0,1,2,3,4 (5 items). This seems to align with inclusive end behavior for lines 1-N.

  It's possible the user intends `endLine` to be the index of the last line they want. If the logic is correct as-is, no change needed. If it was intended to include the line, but implemented incorrectly (e.g., if `endLine` is meant to be the actual line number and slice stops before it), this could be a bug.

  Suggested change: // Clarify intent: Does endLine include the line itself?
// Current: lines.slice((startLine||1)-1, endLine || lines.length)
// If startLine=2, endLine=3 (want lines 2 and 3): slice(1, 3) -> indices 1,2. Correct.
// If startLine=1, endLine=1 (want just line 1): slice(0, 1) -> index 0. Correct.
// The logic appears sound for inclusive ranges if interpreted as 'up to but not including'.
// No change required unless specific edge case fails.

## Suggested refactor (untrusted model output)

None.

## Assumptions

The function `resolveWithinRoot` returns `null` only when the path strictly escapes the repo root. If it allows relative paths that might be resolved differently, the check is insufficient.
The `filesRead` Set is expected to track unique files read during a task run and not persist across independent runs (it's passed as an argument).
The `endLine` parameter represents the exclusive upper bound of the slice (line N means index N-1, slice stops at N).

Needs broader context: true

Human decision is stored in SQLite; accept/reject never applies code.
