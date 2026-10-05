import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// On a wide screen the Asked-before chapter takes the figure's place the way
// the opening gives it up: by scroll, through the centre point. The runtime
// measures the chapter's arrival (--asked: 0 below the screen, 1 at the
// reading line, 2 as far again) and the next chapter's (--leaving).
const css = readFileSync(join(import.meta.dir, "../../src/story.css"), "utf8");
const wide = css.split("@media not all and (max-width: 60rem)")[1] ?? "";

describe("the Asked-before chapter on a wide screen", () => {
  test("holds its drawing at the figure's centre line while the chapter is read", () => {
    expect(wide).toMatch(
      /\.asked > \.net-layer \{[^}]*position: sticky;[^}]*order: -1;[^}]*top: calc\(\s*var\(--bar-height, 4\.6rem\) \+ \(100svh - var\(--bar-height, 4\.6rem\)\) \/ 2\s*\);[^}]*height: 0;[^}]*margin-left: calc\(100% \+ var\(--words-gap\)\);/,
    );
    expect(wide).toMatch(
      /\.asked > \.net-layer > \* \{[^}]*translate: 0 -50%;/,
    );
  });

  test("opens its drawing out of the point as the chapter arrives, and draws it back in as the next chapter does", () => {
    expect(wide).toMatch(
      /\.asked > \.net-layer > \* \{[^}]*scale: calc\(\s*clamp\(0, \(var\(--asked, 0\) - 1\) \* 2, 1\) \*\s*\(1 - clamp\(0, var\(--leaving, 0\), 1\)\)\s*\);/,
    );
  });

  test("draws the figure into the point as the chapter arrives, and opens it again as the next chapter does", () => {
    expect(wide).toMatch(
      /\.living-org \.o-box \{[^}]*scale: min\(\s*clamp\(0, var\(--handover, 0\) - 1, 1\),\s*max\(\s*1 - clamp\(0, var\(--asked, 0\), 1\),\s*clamp\(0, \(var\(--leaving, 0\) - 1\) \* 2, 1\)\s*\)\s*\);/,
    );
    // No timed fade of the figure any more.
    expect(css).not.toMatch(/\.story\.is-asked \.figure \{/);
  });
});
