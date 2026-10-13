import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// On a phone the drawing stands in a strip above the words; the opening's
// box has to land on the first screen under it, so the strip and the
// opening's type are sized for that (see docs/plans/rizom-ai-story-site.md).
const css = readFileSync(join(import.meta.dir, "../../src/story.css"), "utf8");
const phone = css.split("@media (max-width: 60rem)").slice(1).join("\n");

describe("the story on a phone", () => {
  test("keeps the Ask room's words clear of the strip, which no figure holds open there", () => {
    // The drawing is fixed in the strip; on the room page nothing else takes
    // that height in the flow, so the chapters start under it.
    expect(phone).toMatch(
      /\.story--room \.chapters \{[^}]*padding-top: var\(--strip-h\);/,
    );
  });

  test("gives the drawing's strip about a third of the screen, from one variable", () => {
    expect(phone).toMatch(/\.story \{[^}]*--strip-h: 34svh;/);
    expect(phone).toMatch(/\.figure \{[^}]*height: var\(--strip-h\);/);
    expect(phone).toMatch(/\.net-layer \{[^}]*height: var\(--strip-h\);/);
    expect(phone).toMatch(
      /\.net-layer > \* \{[^}]*width: min\(100%, var\(--strip-h\)\);/,
    );
    expect(phone).toMatch(
      /\.chapter \{[^}]*scroll-margin-top: calc\(var\(--bar-height, 4\.6rem\) \+ var\(--strip-h\)\);/,
    );
    expect(phone).not.toContain("42svh");
  });

  test("sets the opening's headline and lede at phone sizes so the box follows on the first screen", () => {
    expect(phone).toMatch(
      /\.chapter--opening h1 \{[^}]*font-size: clamp\(2\.3rem, 9\.5vw, 3\.6rem\);/,
    );
    expect(phone).toMatch(
      /\.chapter--opening \.lede \{[^}]*font-size: 1\.05rem;[^}]*margin-top: 1rem;/,
    );
  });
});
