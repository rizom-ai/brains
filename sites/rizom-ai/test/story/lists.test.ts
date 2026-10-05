import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The chapters' definition lists: the science's three dimensions (.dims) and
// the parts of the organism, the arc and the rooms (.parts) are one kind of
// list and share one set of rules, a left accent rule, display-face titles
// and muted text. A part that is one of the site's rooms links there, and
// the link shows as a door.
const css = readFileSync(join(import.meta.dir, "../../src/story.css"), "utf8");

describe("the chapters' lists", () => {
  test("the science's dimensions are styled like the parts, by the same rules", () => {
    expect(css).toMatch(/\.parts,\s*\.dims \{[^}]*display: grid;/);
    expect(css).toMatch(
      /\.parts div,\s*\.dims div \{[^}]*border-left: 1px solid/,
    );
    expect(css).toMatch(
      /\.parts dt,\s*\.dims dt \{[^}]*font-family: var\(--font-display\);/,
    );
    expect(css).toMatch(
      /\.parts dd,\s*\.dims dd \{[^}]*color: var\(--color-text-muted\);/,
    );
  });

  test("a part that is a room links there as a door: accent underline, accent on hover and focus", () => {
    expect(css).toMatch(
      /\.parts dt a \{[^}]*color: inherit;[^}]*text-decoration: underline;[^}]*text-decoration-color: rgb\(from var\(--color-accent\) r g b \/ 0\.5\);[^}]*text-underline-offset: 0\.2em;/,
    );
    expect(css).toMatch(
      /\.parts dt a:hover,\s*\.parts dt a:focus-visible \{[^}]*color: var\(--color-accent\);/,
    );
  });
});
