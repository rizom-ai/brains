import { describe, it, expect } from "bun:test";
import { seriesAdapter } from "../src/adapters/series-adapter";
import type { Series } from "../src/schemas/series";

function createTestSeries(overrides: Partial<Series> = {}): Series {
  return {
    id: "test-series",
    entityType: "series",
    content:
      "---\ntitle: Test Series\nslug: test-series\n---\n# Test Series\n\n## Description\n\nA test series.",
    contentHash: "abc123",
    metadata: { title: "Test Series", slug: "test-series" },
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    ...overrides,
  };
}

describe("SeriesAdapter", () => {
  it("should have entityType 'series'", () => {
    expect(seriesAdapter.entityType).toBe("series");
  });

  describe("fromMarkdown", () => {
    it("should parse frontmatter into metadata", () => {
      const markdown =
        "---\ntitle: My Series\nslug: my-series\n---\n# My Series\n";
      const result = seriesAdapter.fromMarkdown(markdown);

      expect(result.metadata?.title).toBe("My Series");
      expect(result.metadata?.slug).toBe("my-series");
      expect(result.entityType).toBe("series");
    });
  });

  describe("toMarkdown", () => {
    it("should generate markdown with frontmatter", () => {
      const entity = createTestSeries();
      const markdown = seriesAdapter.toMarkdown(entity);

      expect(markdown).toContain("title: Test Series");
      expect(markdown).toContain("slug: test-series");
    });
  });

  describe("parseBody", () => {
    it("should extract description from body", () => {
      const markdown =
        "---\ntitle: Test\nslug: test\n---\n# Test\n\n## Description\n\nSome description.";
      const body = seriesAdapter.parseBody(markdown);

      expect(body.description).toBe("Some description.");
    });

    it("should return empty for malformed content", () => {
      const body = seriesAdapter.parseBody("no frontmatter here");

      expect(body.description).toBeUndefined();
    });
  });
});
