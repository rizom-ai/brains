import { describe, expect, it } from "bun:test";
import baseCSS from "../../src/styles/base.css" with { type: "text" };

describe("site base stylesheet", () => {
  it("paints the page colour on the document canvas, so overscroll past the footer is never white", () => {
    expect(baseCSS).toMatch(
      /html \{\s*background-color: var\(--color-bg\);\s*\}/,
    );
  });
});
