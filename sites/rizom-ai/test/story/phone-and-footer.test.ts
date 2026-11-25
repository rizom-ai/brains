import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../../src/story.css"), "utf8");

/** The declarations of a top-level rule, outside any media query. */
const topLevelRule = (selector: string): string | undefined => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\:]/g, "\\$&");
  return css.match(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`))?.[1];
};

const zIndex = (rule: string | undefined): number =>
  Number(rule?.match(/z-index: (\d+)/)?.[1]);

// The story is a one-column grid, and a grid column is never narrower than
// its content. On a phone the quick start's code block is wider than the
// screen, so the chapters column grew to the block's width (445px in a 390px
// screen) and every chapter's text ran off the right edge.
describe("the chapters on a phone", () => {
  test("the chapters column may shrink below its widest content", () => {
    expect(topLevelRule(".chapters")).toMatch(/min-width: 0;/);
  });

  test("the code block scrolls inside itself", () => {
    expect(topLevelRule(".code")).toMatch(/overflow-x: auto;/);
  });
});

// The reading thread is fixed to the screen. With the footer below it, the
// thread crossed the footer's wordmark and text at the end of a story page.
describe("the reading thread at the footer", () => {
  test("the footer lies over the reading thread", () => {
    const footer = topLevelRule("footer.site-footer");
    expect(footer).toBeDefined();
    expect(zIndex(footer)).toBeGreaterThan(zIndex(topLevelRule(".rail")));
  });

  test("the footer carries the page's own texture, so it shows no band", () => {
    const footer = topLevelRule("footer.site-footer");
    expect(footer).toMatch(/background-color: var\(--color-bg\);/);
    expect(footer).toMatch(/background-image: var\(--bg-noise\);/);
  });
});
