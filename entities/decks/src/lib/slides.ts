const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const SLIDE_HEADING = /^ {0,3}#{1,2}[ \t]/;

/** Where a deck's slides break when the text has no --- separators. */
export type SlideBreaks = "headings" | "paragraphs";

function isBlank(line: string | undefined): boolean {
  return line === undefined || line.trim() === "";
}

/**
 * Split text into slides outside code: before each # or ## heading, or
 * before each paragraph. Every line of the text is kept as written; only
 * --- separator lines are added. Returns undefined when there is nothing
 * to split after the first block.
 */
export function splitSlides(text: string, at: SlideBreaks): string | undefined {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let fence: string | undefined;
  let split = false;

  for (const [index, line] of lines.entries()) {
    const opener = FENCE.exec(line)?.[1];
    const startsSlide =
      !fence &&
      out.some((previous) => !isBlank(previous)) &&
      (at === "headings"
        ? SLIDE_HEADING.test(line)
        : !isBlank(line) && isBlank(lines[index - 1]));
    if (startsSlide) {
      if (!isBlank(out.at(-1))) out.push("");
      out.push("---", "");
      split = true;
    }
    if (fence) {
      if (opener && opener[0] === fence[0] && opener.length >= fence.length) {
        fence = undefined;
      }
    } else if (opener) {
      fence = opener;
    }
    out.push(line);
  }

  return split ? out.join(eol) : undefined;
}
