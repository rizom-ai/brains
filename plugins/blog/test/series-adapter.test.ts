import { describe, it, expect, beforeEach } from "bun:test";
import { SeriesAdapter } from "../src/adapters/series-adapter";
import type { Series } from "../src/schemas/series";
import { createTestEntity } from "@brains/test-utils";

function createMockSeries(overrides: Partial<Series> = {}): Series {
  return createTestEntity<Series>("series", {
    content: "# Test Series",
    metadata: {
      name: "Test Series",
      slug: "test-series",
    },
    ...overrides,
  });
}

describe("SeriesAdapter", () => {
  let adapter: SeriesAdapter;

  beforeEach(() => {
    adapter = new SeriesAdapter();
  });

  describe("schema", () => {
    it("should have correct entity type", () => {
      expect(adapter.entityType).toBe("series");
    });

    it("should have a valid zod schema", () => {
      expect(adapter.schema).toBeDefined();
    });
  });

  describe("toMarkdown", () => {
    it("should generate frontmatter with name and slug", () => {
      const entity = createMockSeries({
        content: "# Ecosystem Architecture",
        metadata: {
          name: "Ecosystem Architecture",
          slug: "ecosystem-architecture",
        },
      });

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("name: Ecosystem Architecture");
      expect(markdown).toContain("slug: ecosystem-architecture");
      expect(markdown).toContain("# Ecosystem Architecture");
    });

    it("should include description when present", () => {
      const entity = createMockSeries({
        content: "# My Series",
        metadata: {
          name: "My Series",
          slug: "my-series",
          description: "A great series about things",
        },
      });

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("description: A great series about things");
    });

    it("should not include description when not present", () => {
      const entity = createMockSeries({
        content: "# My Series",
        metadata: {
          name: "My Series",
          slug: "my-series",
        },
      });

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).not.toContain("description:");
    });
  });

  describe("fromMarkdown", () => {
    it("should extract name and slug from frontmatter", () => {
      const markdown = `---
name: Ecosystem Architecture
slug: ecosystem-architecture
---

# Ecosystem Architecture`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("series");
      expect(result.metadata?.name).toBe("Ecosystem Architecture");
      expect(result.metadata?.slug).toBe("ecosystem-architecture");
    });

    it("should extract description when present", () => {
      const markdown = `---
name: My Series
slug: my-series
description: An awesome series
---

# My Series`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.metadata?.description).toBe("An awesome series");
    });

    it("should store full markdown including frontmatter in content", () => {
      const markdown = `---
name: Test Series
slug: test-series
---

# Test Series

Some content here.`;

      const result = adapter.fromMarkdown(markdown);

      // Content includes frontmatter so it can be parsed later (e.g., for coverImageId)
      expect(result.content).toBe(markdown);
    });
  });

  describe("extractMetadata", () => {
    it("should return entity metadata", () => {
      const entity = createMockSeries({
        metadata: {
          name: "Extracted Series",
          slug: "extracted-series",
          description: "Test description",
        },
      });

      const metadata = adapter.extractMetadata(entity);

      expect(metadata.name).toBe("Extracted Series");
      expect(metadata.slug).toBe("extracted-series");
      expect(metadata.description).toBe("Test description");
    });
  });

  describe("roundtrip", () => {
    it("should preserve metadata through toMarkdown -> fromMarkdown", () => {
      const entity = createMockSeries({
        content: "# Public Badges",
        metadata: {
          name: "Public Badges",
          slug: "public-badges",
          description: "A series about digital credentials",
        },
      });

      const markdown = adapter.toMarkdown(entity);
      const parsed = adapter.fromMarkdown(markdown);

      expect(parsed.metadata?.name).toBe("Public Badges");
      expect(parsed.metadata?.slug).toBe("public-badges");
      expect(parsed.metadata?.description).toBe(
        "A series about digital credentials",
      );
      // Content now stores full markdown including frontmatter
      expect(parsed.content).toBe(markdown);
    });

    it("should preserve content through fromMarkdown -> toMarkdown", () => {
      const original = `---
name: New Institutions
slug: new-institutions
---

# New Institutions

This is the content.`;

      const parsed = adapter.fromMarkdown(original);
      const entity = createMockSeries({
        content: parsed.content ?? "# New Institutions",
        metadata: parsed.metadata ?? {
          name: "New Institutions",
          slug: "new-institutions",
        },
      });
      const output = adapter.toMarkdown(entity);

      expect(output).toContain("name: New Institutions");
      expect(output).toContain("slug: new-institutions");
      expect(output).toContain("# New Institutions");
      expect(output).toContain("This is the content.");
    });

    it("should preserve coverImageId through fromMarkdown -> toMarkdown", () => {
      const original = `---
coverImageId: series-ecosystem-cover
name: Ecosystem Architecture
slug: ecosystem-architecture
---

# Ecosystem Architecture`;

      const parsed = adapter.fromMarkdown(original);
      const entity = createMockSeries({
        content: parsed.content ?? "",
        metadata: parsed.metadata ?? {
          name: "Ecosystem Architecture",
          slug: "ecosystem-architecture",
        },
      });
      const output = adapter.toMarkdown(entity);

      expect(output).toContain("coverImageId: series-ecosystem-cover");
      expect(output).toContain("name: Ecosystem Architecture");
      expect(output).toContain("slug: ecosystem-architecture");
    });
  });
});
