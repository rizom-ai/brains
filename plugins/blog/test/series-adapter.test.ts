import { describe, it, expect, beforeEach } from "bun:test";
import { SeriesAdapter } from "../src/adapters/series-adapter";
import type { Series } from "../src/schemas/series";
import { createTestEntity } from "@brains/test-utils";

function createMockSeries(overrides: Partial<Series> = {}): Series {
  return createTestEntity<Series>("series", {
    content: "# Test Series",
    metadata: {
      title: "Test Series",
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

  it("should have correct entity type", () => {
    expect(adapter.entityType).toBe("series");
  });

  it("should generate frontmatter with title and slug", () => {
    const entity = createMockSeries({
      content: "# Ecosystem Architecture",
      metadata: {
        title: "Ecosystem Architecture",
        slug: "ecosystem-architecture",
      },
    });

    const markdown = adapter.toMarkdown(entity);

    expect(markdown).toContain("title: Ecosystem Architecture");
    expect(markdown).toContain("slug: ecosystem-architecture");
  });

  it("should extract metadata from frontmatter", () => {
    const markdown = `---
title: Ecosystem Architecture
slug: ecosystem-architecture
---

# Ecosystem Architecture`;

    const result = adapter.fromMarkdown(markdown);

    expect(result.metadata?.title).toBe("Ecosystem Architecture");
    expect(result.metadata?.slug).toBe("ecosystem-architecture");
  });

  it("should preserve coverImageId through roundtrip", () => {
    const contentWithCover = `---
coverImageId: ecosystem-cover-image
title: Ecosystem Architecture
slug: ecosystem-architecture
---

# Ecosystem Architecture`;

    const entity = createMockSeries({
      content: contentWithCover,
      metadata: {
        title: "Ecosystem Architecture",
        slug: "ecosystem-architecture",
      },
    });

    const output = adapter.toMarkdown(entity);

    expect(output).toContain("coverImageId: ecosystem-cover-image");
  });
});
