import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The page's background is --color-bg with the --bg-noise texture (the theme
// paints both on html). On the full grid the chapters column is narrower than
// the page, and a solid --color-bg backing on it showed as a flat band with an
// edge against the textured sides. So on the full grid the column paints
// nothing and the drawing's wash fades out toward the text instead. Below the
// full grid the drawing runs under the words, the column starts at the page's
// edge, and the widened backing stays.
const css = readFileSync(join(import.meta.dir, "../../src/story.css"), "utf8");

/** The declarations of a top-level rule, outside any media query. */
const topLevelRule = (selector: string): string | undefined => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\:]/g, "\\$&");
  return css.match(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`))?.[1];
};

describe("the page's texture behind the chapters", () => {
  test("on the full grid the chapters column paints no backing over the page's texture", () => {
    const chapters = topLevelRule(".chapters");
    expect(chapters).toBeDefined();
    expect(chapters).not.toMatch(/background/);
  });

  test("on the full grid the drawing's wash fades out toward the text", () => {
    expect(css).toMatch(
      /@media \(min-width: 80\.0625rem\) \{\s*\.figure::before \{[^}]*mask-image: linear-gradient\(\s*90deg,\s*transparent/,
    );
  });

  test("below the full grid the widened backing stays, so the words stay clear of the drawing", () => {
    expect(css).toMatch(
      /@media \(max-width: 80rem\) \{\s*\.chapters \{\s*background: linear-gradient\(/,
    );
  });
});
