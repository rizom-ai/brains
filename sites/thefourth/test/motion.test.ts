import { describe, expect, test } from "bun:test";
import site from "../src";

describe("motion", () => {
  const css = site.themeOverride ?? "";
  const scripts = (site.headScripts ?? []).join("\n");

  test("raises each act into view as it scrolls in, where view timelines exist", () => {
    expect(css).toMatch(
      /@supports \(animation-timeline: view\(\)\)[^]*\.tf-reveal \{[^}]*animation-timeline: view\(\)/,
    );
    expect(css).toMatch(/\.tf-l1 \{[^}]*tf-drift-up/);
    expect(css).toMatch(/\.tf-l3 \{[^}]*tf-drift-down/);
  });

  test("turns the pointer into the design's wand", () => {
    expect(css).toMatch(
      /\.tf-site[^{]*\{[^}]*cursor: url\("data:image\/svg\+xml,/,
    );
  });

  test("trails sparks behind the wand, and none for reduced motion or touch", () => {
    expect(scripts).toContain("tf-spark");
    expect(scripts).toContain("prefers-reduced-motion: reduce");
    expect(scripts).toContain("pointerType");
  });

  test("stops every animation for reduced motion", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[^]*animation: none !important/,
    );
  });

  test("lifts buttons and thickens links under the wand, and rings the focus in mustard", () => {
    expect(css).toMatch(/\.tf-btn:hover \{[^}]*translateY\(-3px\)/);
    expect(css).toMatch(
      /\.tf-link:hover \{[^}]*text-decoration-thickness: 3px/,
    );
    expect(css).toMatch(
      /:focus-visible \{[^}]*outline: 3px solid var\(--palette-mustard\)/,
    );
  });

  test("sparks in mustard", () => {
    expect(css).toMatch(
      /\.tf-spark \{[^}]*background: var\(--palette-mustard\)/,
    );
    expect(scripts).not.toContain("tf-spark--");
  });
});
