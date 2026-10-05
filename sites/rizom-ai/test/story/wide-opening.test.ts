import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ASK_ROOM_STYLES } from "@brains/site-atlas";

// On a wide screen the story is an Ask room (the room's styles come with the
// kit): the opening's words scroll within the screen beside the drawing,
// which holds the figure's place down the story and hands over to the figure
// through their shared centre point, driven by the scroll; the leads between words and drawing are
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

  test("hands over by scroll: the network draws into its centre point as the science comes up, and the pyramid opens out of it beyond the line", () => {
    // --handover is the runtime's measure: 0 with the science below the
    // screen, 1 with its top at the reading line, 2 as far again. No timers:
    // scrolling back runs it backwards.
    expect(wide).toMatch(
      /:where\(\.chapters\) > \.net-layer > \* \{[^}]*scale: calc\(1 - clamp\(0, var\(--handover, 0\), 1\)\);/,
    );
    expect(wide).toMatch(
      /\.living-org \.o-box \{[^}]*scale: min\(\s*clamp\(0, var\(--handover, 0\) - 1, 1\),/,
    );
    expect(wide).toMatch(
      /\.net-leads \{[^}]*opacity: calc\(1 - clamp\(0, var\(--handover, 0\) \* 2, 1\)\);/,
    );
    expect(wide).not.toMatch(/transition: scale/);
    expect(wide).not.toMatch(/data-stage="0"\]\)\)\s+:where\(\.chapters\)/);
  });

  test("spreads the lead layer over the chapters column, its frame", () => {
    expect(css).toMatch(/\.net-leads \{[^}]*position: absolute;[^}]*inset: 0;/);
  });
});
