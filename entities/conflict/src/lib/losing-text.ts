const INFO = "text";

/**
 * A losing file as a conflict's body: inside a fenced code block, so the
 * brain stores it byte for byte. Left bare, a file that opens with its own
 * frontmatter would be read as part of the conflict's, and its blank lines
 * and line endings tidied like any markdown.
 *
 * The fence is longer than any run of backticks in the file, so the file
 * cannot close it.
 */
export function encodeLosingText(text: string): string {
  const longest = Math.max(
    0,
    ...[...text.matchAll(/`+/g)].map((run) => run[0].length),
  );
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${INFO}\n${text}\n${fence}\n`;
}

/** The losing file a conflict's body holds, exactly as it arrived. */
export function decodeLosingText(body: string): string {
  const opening = /^(`{3,})text\n/.exec(body);
  const fence = opening?.[1];
  if (!opening || !fence) {
    throw new Error("A conflict's body is not a fenced losing text");
  }
  const closing = body.lastIndexOf(`\n${fence}`);
  if (closing < opening[0].length - 1) {
    throw new Error("A conflict's losing text is not closed");
  }
  return body.slice(opening[0].length, closing);
}
