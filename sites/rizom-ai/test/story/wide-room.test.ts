import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ASK_ROOM_STYLES } from "@brains/site-atlas";

// On a wide screen /ask is an Ask room told as a story without a figure: its
// own network drawing holds the figure's place, sticky at the centre line
// down the page (the story is a size container, so nothing in it can be
// fixed to the screen), while the words scroll within the screen beside it.
// The homepage's opening keeps its drawing in the opening, which leaves with
// it; nothing hands over.
const css = readFileSync(join(import.meta.dir, "../../src/story.css"), "utf8");
const wide = css.split("@media not all and (max-width: 60rem)")[1] ?? "";

describe("the Ask room page on a wide screen", () => {
  test("lets the words scroll within the screen, keeping the bar and the chapter's padding clear", () => {
    expect(wide).toMatch(
      /\.chapter--opening \.opening__words \{[^}]*--ask-column-clear: calc\(8rem \+ var\(--bar-height, 4\.6rem\)\);/,
    );
    expect(ASK_ROOM_STYLES).toMatch(
      /\[data-ask-column\] \{[^}]*max-height: calc\(100svh - var\(--ask-column-clear, 4\.5rem\)\);[^}]*overflow-y: auto;/,
    );
  });

  test("holds the room's drawing at the figure's centre line down the page", () => {
    expect(wide).toMatch(
      /\.story--room :where\(\.chapters\) > \.net-layer \{[^}]*position: sticky;[^}]*top: calc\(\s*var\(--bar-height, 4\.6rem\) \+ \(100svh - var\(--bar-height, 4\.6rem\)\) \/ 2\s*\);[^}]*height: 0;/,
    );
    expect(wide).toMatch(
      /\.story--room :where\(\.chapters\) > \.net-layer > \* \{[^}]*translate: 0 -50%;/,
    );
  });

  test("hands nothing over: no scroll measures, no scaling of either drawing", () => {
    expect(css).not.toContain("--handover");
    expect(css).not.toContain("--asked");
    expect(css).not.toContain("--leaving");
    expect(css).not.toMatch(/\.o-box \{[^}]*scale:/);
  });

  test("spreads the lead layer over the chapters column, its frame", () => {
    expect(css).toMatch(/\.net-leads \{[^}]*position: absolute;[^}]*inset: 0;/);
  });
});
