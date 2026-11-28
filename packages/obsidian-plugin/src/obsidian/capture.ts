/** The longest title a captured text gets from its first line. */
const TITLE_LENGTH = 60;

/** What a file name cannot hold, in Obsidian or on the drives it syncs to. */
const UNSAFE = /[\\/:*?"<>|#^[\]]/g;

/**
 * A title for a captured text: its first line that says something, without
 * markdown's marks, cut at a word when it runs long. Empty when the text
 * says nothing.
 */
export function titleOf(text: string): string {
  const line =
    text
      .split("\n")
      .map((raw) =>
        raw
          // A link is its text.
          .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
          // Headings, quotes, list marks and rules at the start of a line.
          .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+|-{3,}\s*$)*/, "")
          // Emphasis and code marks.
          .replace(/[*_`~]+/g, "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .find((clean) => clean !== "") ?? "";
  if (line.length <= TITLE_LENGTH) return line;
  const cut = line.slice(0, TITLE_LENGTH + 1);
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut.slice(0, TITLE_LENGTH)).trim();
}

/** A title as a file name: nothing a file name cannot hold, no dots at its ends. */
function fileNameOf(title: string): string {
  return title
    .replace(UNSAFE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .trim();
}

/**
 * The note a captured text becomes: a file at the top of the vault, where
 * the brain keeps notes, under the next free name its title gives. Nothing
 * when there is no text or no usable name.
 */
export function capturedNote(
  text: string,
  title: string,
  exists: (path: string) => boolean,
): { path: string; content: string } | undefined {
  const name = fileNameOf(title);
  if (text.trim() === "" || name === "") return undefined;
  const names = [
    `${name}.md`,
    ...Array.from({ length: 998 }, (_, index) => `${name} ${index + 2}.md`),
  ];
  const path = names.find((candidate) => !exists(candidate));
  if (path === undefined) return undefined;
  return { path, content: text.endsWith("\n") ? text : `${text}\n` };
}
