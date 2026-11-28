/** A line of one version, and whether the other version lacks it. */
export interface ComparedLine {
  text: string;
  differs: boolean;
}

function linesOf(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  // The newline that ends a file ends its last line; it is not a line more.
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}

/** One version's lines, each marked when the other has no line left to match it. */
function marked(lines: string[], other: string[]): ComparedLine[] {
  const left = other.reduce(
    (counts, line) => counts.set(line, (counts.get(line) ?? 0) + 1),
    new Map<string, number>(),
  );
  return lines.map((text) => {
    const count = left.get(text) ?? 0;
    if (count > 0) left.set(text, count - 1);
    return { text, differs: count === 0 };
  });
}

/**
 * Two versions of a note, line by line, for showing side by side. A line is
 * marked when the other version does not have it; nothing is said of where
 * lines moved to.
 */
export function compareVersions(
  brains: string,
  yours: string,
): { brains: ComparedLine[]; yours: ComparedLine[] } {
  const [ours, theirs] = [linesOf(brains), linesOf(yours)];
  return { brains: marked(ours, theirs), yours: marked(theirs, ours) };
}
