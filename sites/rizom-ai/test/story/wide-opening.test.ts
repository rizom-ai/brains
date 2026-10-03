import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// On a wide screen the page is the one scroller: an answer grows in the
// opening instead of scrolling inside a band, the drawing keeps its place
// beside the words while the opening is read, and the leads between them are
// drawn in the viewport's frame (see docs/plans/rizom-ai-network-answers.md).
const css = readFileSync(join(import.meta.dir, "../../src/story.css"), "utf8");
const wide = css.split("@media not all and (max-width: 60rem)")[1] ?? "";

describe("the opening on a wide screen", () => {
  test("lets the conversation grow in the opening instead of scrolling inside it", () => {
    expect(css).toMatch(
      /\.opening__ask:not\(\[data-ask-sheet\]\) \.brain-box-scroll \{[^}]*max-height: none;[^}]*overflow: visible;/,
    );
  });

  test("keeps the drawing beside the words while the opening is read, and lets it go with the opening", () => {
    expect(wide).toMatch(
      /:where\(\.chapter--opening\) > \.net-layer \{[^}]*position: sticky;[^}]*order: -1;[^}]*height: 0;/,
    );
    expect(wide).toMatch(
      /:where\(\.chapter--opening\) > \.net-layer > \* \{[^}]*translate: 0 -50%;/,
    );
    expect(wide).toMatch(
      /\.story:has\(\.figure:not\(\[data-stage="0"\]\)\)\s+:where\(\.chapter--opening\)\s+> \.net-layer \{[^}]*opacity: 0;/,
    );
  });

  test("frames the leads in the viewport", () => {
    expect(css).toMatch(
      /\.net-leads \{[^}]*position: fixed;[^}]*width: 100vw;[^}]*height: 100vh;/,
    );
  });
});
