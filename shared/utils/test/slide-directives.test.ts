import { describe, it, expect } from "bun:test";
import { parseSlideDirectives, splitColumns } from "../src/slide-directives";

describe("parseSlideDirectives", () => {
  it("should return empty attributes when no directive present", () => {
    const result = parseSlideDirectives("# Hello\n\nSome content");
    expect(result.attributes).toEqual({});
    expect(result.markdown).toBe("# Hello\n\nSome content");
  });

  it("should parse a single attribute", () => {
    const result = parseSlideDirectives(
      '<!-- .slide: data-background-color="#ff0000" -->\n# Title',
    );
    expect(result.attributes["data-background-color"]).toBe("#ff0000");
    expect(result.markdown).toBe("# Title");
  });

  it("should parse multiple attributes", () => {
    const result = parseSlideDirectives(
      '<!-- .slide: data-background-image="url.jpg" data-background-opacity="0.4" -->\n# Title',
    );
    expect(result.attributes["data-background-image"]).toBe("url.jpg");
    expect(result.attributes["data-background-opacity"]).toBe("0.4");
  });

  it("should parse boolean attributes", () => {
    const result = parseSlideDirectives(
      "<!-- .slide: data-auto-animate -->\n# Title",
    );
    expect(result.attributes["data-auto-animate"]).toBe("true");
  });

  it("should parse class attribute", () => {
    const result = parseSlideDirectives(
      '<!-- .slide: class="layout-split" -->\n# Title',
    );
    expect(result.attributes["class"]).toBe("layout-split");
  });

  it("should strip directive comment from markdown", () => {
    const result = parseSlideDirectives(
      '<!-- .slide: data-background-color="#000" -->\n\n# Title\n\nContent',
    );
    expect(result.markdown).toBe("# Title\n\nContent");
  });

  it("should handle directive with extra whitespace", () => {
    const result = parseSlideDirectives(
      '<!--  .slide:  data-background-color="#000"  -->\n# Title',
    );
    expect(result.attributes["data-background-color"]).toBe("#000");
  });

  it("should handle values with spaces in quotes", () => {
    const result = parseSlideDirectives(
      '<!-- .slide: data-background-image="path/to/my image.jpg" -->\n# Title',
    );
    expect(result.attributes["data-background-image"]).toBe(
      "path/to/my image.jpg",
    );
  });

  it("should ignore non-slide comments", () => {
    const result = parseSlideDirectives(
      "<!-- This is a regular comment -->\n# Title",
    );
    expect(result.attributes).toEqual({});
    expect(result.markdown).toBe("<!-- This is a regular comment -->\n# Title");
  });

  it("should handle directive on its own line in the middle", () => {
    const md = 'Some text\n<!-- .slide: data-transition="fade" -->\nMore text';
    const result = parseSlideDirectives(md);
    expect(result.attributes["data-transition"]).toBe("fade");
    expect(result.markdown).not.toContain("<!-- .slide:");
    expect(result.markdown).toContain("Some text");
    expect(result.markdown).toContain("More text");
  });
});

describe("splitColumns", () => {
  it("should return null when no break directive present", () => {
    const result = splitColumns("# Title\n\nSome content");
    expect(result).toBeNull();
  });

  it("should split on <!-- .break --> into two columns", () => {
    const md = "Left content\n\n<!-- .break -->\n\nRight content";
    const result = splitColumns(md);
    expect(result).toHaveLength(2);
    expect(result?.[0]?.trim()).toBe("Left content");
    expect(result?.[1]?.trim()).toBe("Right content");
  });

  it("should handle multiple breaks for three columns", () => {
    const md =
      "Column 1\n\n<!-- .break -->\n\nColumn 2\n\n<!-- .break -->\n\nColumn 3";
    const result = splitColumns(md);
    expect(result).toHaveLength(3);
    expect(result?.[0]?.trim()).toBe("Column 1");
    expect(result?.[1]?.trim()).toBe("Column 2");
    expect(result?.[2]?.trim()).toBe("Column 3");
  });

  it("should handle break with extra whitespace", () => {
    const md = "Left\n\n<!--  .break  -->\n\nRight";
    const result = splitColumns(md);
    expect(result).toHaveLength(2);
  });

  it("should handle break without surrounding blank lines", () => {
    const md = "Left\n<!-- .break -->\nRight";
    const result = splitColumns(md);
    expect(result).toHaveLength(2);
    expect(result?.[0]?.trim()).toBe("Left");
    expect(result?.[1]?.trim()).toBe("Right");
  });
});
