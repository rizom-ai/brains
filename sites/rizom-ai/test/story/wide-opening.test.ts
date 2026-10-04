import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ASK_ROOM_STYLES } from "@brains/site-atlas";

// On a wide screen the opening is an Ask room (the room's styles come with
// the kit): its words scroll within the screen beside the drawing, which
// keeps its place while the opening is read and leaves with it; the leads
// between them are drawn in the viewport's frame.
const css = readFileSync(join(import.meta.dir, "../../src/story.css"), "utf8");
const wide = css.split("@media not all and (max-width: 60rem)")[1] ?? "";

describe("the opening on a wide screen", () => {
  test("lets the words scroll within the screen, keeping the opening's padding clear", () => {
    expect(wide).toMatch(
      /\.chapter--opening \.opening__words \{[^}]*--ask-column-clear: calc\(8rem \+ var\(--bar-height, 4\.6rem\)\);/,
    );
    expect(ASK_ROOM_STYLES).toMatch(
      /\[data-ask-column\] \{[^}]*max-height: calc\(100svh - var\(--ask-column-clear, 4\.5rem\)\);[^}]*overflow-y: auto;/,
    );
    // The page carries no copy of the room's rules.
    expect(css).not.toContain(".brain-box-scroll");
    expect(css).not.toContain("data-ask-flash");
  });

  test("keeps the drawing beside the words while the opening is read, and lets it go with the opening", () => {
    expect(wide).toMatch(
      /:where\(\.chapter--opening\) > \.net-layer \{[^}]*position: sticky;[^}]*order: -1;[^}]*height: 0;/,
    );
    expect(wide).toMatch(
      /:where\(\.chapter--opening\) > \.net-layer > \* \{[^}]*translate: 0 -50%;/,
    );
    expect(wide).toMatch(
      /\.story:has\(\.figure:not\(\[data-stage="0"\]\)\)\s+:where\(\.chapter--opening\)\s+> \.net-layer,\s+\.story:has\(\.figure:not\(\[data-stage="0"\]\)\) \.net-leads \{[^}]*opacity: 0;/,
    );
  });

  test("frames the leads in the viewport", () => {
    expect(css).toMatch(
      /\.net-leads \{[^}]*position: fixed;[^}]*width: 100vw;[^}]*height: 100vh;/,
    );
  });
});
