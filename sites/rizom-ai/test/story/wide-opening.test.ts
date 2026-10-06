import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ASK_ROOM_STYLES } from "@brains/site-atlas";

// On a wide screen the story is an Ask room (the room's styles come with the
// kit): the opening's words scroll within the screen beside the drawing,
// which holds the figure's place down the story and hands over to the figure
// through their shared centre point; the leads between words and drawing are
// drawn in the chapters column's frame.
const css = readFileSync(join(import.meta.dir, "../../src/story.css"), "utf8");
const wide = css.split("@media not all and (max-width: 60rem)")[1] ?? "";

describe("the opening on a wide screen", () => {
  test("lets the words scroll within the screen, keeping the bar and the opening's padding clear", () => {
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

  test("holds the drawing at the figure's centre down the whole story, so both drawings share a point", () => {
    // Sticky in the chapters column (the story is a size container, so
    // nothing in it can be fixed to the screen), at the figure's centre line.
    expect(wide).toMatch(
      /:where\(\.chapters\) > \.net-layer \{[^}]*position: sticky;[^}]*top: calc\(\s*var\(--bar-height, 4\.6rem\) \+ \(100svh - var\(--bar-height, 4\.6rem\)\) \/ 2\s*\);[^}]*height: 0;/,
    );
    expect(wide).toMatch(
      /:where\(\.chapters\) > \.net-layer > \* \{[^}]*translate: 0 -50%;/,
    );
  });

  test("draws the network into its centre point when the reading moves the figure on, and back out when it returns", () => {
    expect(wide).toMatch(
      /:where\(\.chapters\) > \.net-layer > \* \{[^}]*transition: scale 1\.2s cubic-bezier\(0\.3, 0\.7, 0\.2, 1\);/,
    );
    expect(wide).toMatch(
      /\.story:has\(\.figure:not\(\[data-stage="0"\]\)\)\s+:where\(\.chapters\)\s+> \.net-layer\s+> \* \{[^}]*scale: 0;/,
    );
    // The layer holds its light while it draws in and goes out at the point;
    // back from the point it is lit at once.
    expect(wide).toMatch(
      /\.story:has\(\.figure:not\(\[data-stage="0"\]\)\)\s+:where\(\.chapters\)\s+> \.net-layer \{[^}]*transition: opacity 0\.6s ease 0\.6s;/,
    );
    expect(wide).toMatch(
      /:where\(\.chapters\) > \.net-layer \{[^}]*transition: opacity 0\.3s ease;/,
    );
    // The leads go with the drawing.
    expect(wide).toMatch(
      /\.story:has\(\.figure:not\(\[data-stage="0"\]\)\)\s+:where\(\.chapters\)\s+> \.net-layer,\s+\.story:has\(\.figure:not\(\[data-stage="0"\]\)\) \.net-leads \{[^}]*opacity: 0;/,
    );
  });

  test("spreads the lead layer over the chapters column, its frame", () => {
    expect(css).toMatch(/\.net-leads \{[^}]*position: absolute;[^}]*inset: 0;/);
  });
});
