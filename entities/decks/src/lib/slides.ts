const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const SLIDE_HEADING = /^ {0,3}#{1,2}[ \t]/;

/**
 * Split text into slides before each # or ## heading, outside code, so a
 * pasted talk without --- separators still reads as a deck. Returns
 * undefined when there is no heading to split on after the first line.
 */
export function splitSlidesOnHeadings(text: string): string | undefined {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let fence: string | undefined;
  let split = false;

  for (const line of lines) {
    const opener = FENCE.exec(line)?.[1];
    if (fence) {
      if (opener && opener[0] === fence[0] && opener.length >= fence.length) {
        fence = undefined;
      }
    } else if (opener) {
      fence = opener;
    } else if (
      SLIDE_HEADING.test(line) &&
      out.some((previous) => previous.trim() !== "")
    ) {
      if (out.at(-1)?.trim() !== "") out.push("");
      out.push("---", "");
      split = true;
    }
    out.push(line);
  }

  return split ? out.join(eol) : undefined;
}
