function safePhpPath(value: string): boolean {
  return (
    value.endsWith(".php") &&
    /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(value) &&
    value.split("/").every((segment) => segment !== "." && segment !== "..")
  );
}

// Literal filename hints only: no include resolution or alias inference.
export function phpFilenameAnchors(
  query: string,
  trackedFiles: readonly string[],
): { files: string[]; ambiguous: string[] } {
  const tracked = new Set(trackedFiles.filter(safePhpPath));
  const basenames = new Map<string, string[]>();
  for (const file of tracked) {
    const basename = file.slice(file.lastIndexOf("/") + 1);
    const matches = basenames.get(basename) ?? [];
    matches.push(file);
    basenames.set(basename, matches);
  }
  const files = new Set<string>();
  const ambiguous = new Set<string>();
  // Keep unsafe prefixes attached so their basename cannot become a new hint.
  for (const token of query.match(/[^\s"'`()\[\]{},;!?<>]+/g) ?? []) {
    const mention = token.replace(/[.:]+$/, "");
    if (!safePhpPath(mention)) continue;
    if (mention.includes("/")) {
      if (tracked.has(mention) && files.size < 2) files.add(mention);
      continue;
    }
    const matches = basenames.get(mention) ?? [];
    if (matches.length > 1) ambiguous.add(mention);
    else if (matches.length === 1 && files.size < 2) files.add(matches[0]);
  }
  return { files: [...files], ambiguous: [...ambiguous] };
}
