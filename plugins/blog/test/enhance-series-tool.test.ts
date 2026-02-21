import { describe, it, expect, beforeEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { computeContentHash } from "@brains/utils";
import { BlogPlugin } from "../src/plugin";
import type { BlogPost } from "../src/schemas/blog-post";
import type { Series } from "../src/schemas/series";

describe("blog_enhance-series tool", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(async () => {
    harness = createPluginHarness();
    await harness.installPlugin(new BlogPlugin({}));
  });

  const createMockPost = (
    id: string,
    title: string,
    excerpt: string,
    seriesName: string,
  ): BlogPost => {
    const content = `---
title: "${title}"
slug: ${id}
status: draft
excerpt: "${excerpt}"
author: Test Author
seriesName: "${seriesName}"
---

# ${title}

Post content here.`;

    return {
      id,
      entityType: "post",
      content,
      contentHash: computeContentHash(content),
      metadata: {
        title,
        slug: id,
        status: "draft" as const,
        seriesName,
      },
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
  };

  const createMockSeries = (title: string): Series => {
    const slug = title.toLowerCase().replace(/\s+/g, "-");
    const content = `---
title: "${title}"
slug: ${slug}
---

# ${title}`;

    return {
      id: slug, // No prefix - just the slug
      entityType: "series",
      content,
      contentHash: computeContentHash(content),
      metadata: {
        title,
        slug,
      },
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
  };

  it("should return error when series not found", async () => {
    const result = await harness.executeTool("blog_enhance-series", {
      seriesId: "non-existent",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Series not found");
  });

  it("should return error when series has no posts", async () => {
    const entityService = harness.getShell().getEntityService();
    const series = createMockSeries("Empty Series");
    await entityService.createEntity(series);

    const result = await harness.executeTool("blog_enhance-series", {
      seriesId: series.id,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No posts found");
  });

  it("should find series by slug without prefix", async () => {
    const entityService = harness.getShell().getEntityService();

    const series = createMockSeries("Test Series");
    await entityService.createEntity(series);

    const post = createMockPost(
      "post-1",
      "First Post",
      "An introduction",
      "Test Series",
    );
    await entityService.createEntity(post);

    const result = await harness.executeTool("blog_enhance-series", {
      seriesId: "test-series",
    });

    expect(result.success).toBe(true);
  });

  it("should succeed with posts in series", async () => {
    const entityService = harness.getShell().getEntityService();

    const series = createMockSeries("AI Learning");
    await entityService.createEntity(series);

    const post1 = createMockPost(
      "intro-to-ml",
      "Introduction to Machine Learning",
      "Learn the basics of ML",
      "AI Learning",
    );
    const post2 = createMockPost(
      "deep-learning",
      "Deep Learning Fundamentals",
      "Understanding neural networks",
      "AI Learning",
    );
    await entityService.createEntity(post1);
    await entityService.createEntity(post2);

    const result = await harness.executeTool("blog_enhance-series", {
      seriesId: series.id,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});
