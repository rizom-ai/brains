import { describe, it, expect, beforeEach } from "bun:test";
import {
  createPluginHarness,
  expectSuccess,
  expectError,
} from "@brains/plugins/test";
import { computeContentHash } from "@brains/utils/hash";
import { BlogPlugin } from "../src/plugin";
import type { BlogPost } from "../src/schemas/blog-post";
import { createMockSeries } from "./fixtures/blog-entities";

describe("blog_enhance-series tool", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(async () => {
    harness = createPluginHarness();
    await harness.installPlugin(new BlogPlugin({}));
  });

  function createSeriesPost(
    id: string,
    title: string,
    excerpt: string,
    seriesName: string,
  ): BlogPost {
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
  }

  it("should return error when series not found", async () => {
    const result = await harness.executeTool("blog_enhance-series", {
      seriesId: "non-existent",
    });

    expectError(result);
    expect(result.error).toContain("Series not found");
  });

  it("should return error when series has no posts", async () => {
    const entityService = harness.getEntityService();
    const series = createMockSeries("Empty Series");
    await entityService.createEntity(series);

    const result = await harness.executeTool("blog_enhance-series", {
      seriesId: series.id,
    });

    expectError(result);
    expect(result.error).toContain("No posts found");
  });

  it("should find series by slug without prefix", async () => {
    const entityService = harness.getEntityService();

    await entityService.createEntity(createMockSeries("Test Series"));
    await entityService.createEntity(
      createSeriesPost(
        "post-1",
        "First Post",
        "An introduction",
        "Test Series",
      ),
    );

    const result = await harness.executeTool("blog_enhance-series", {
      seriesId: "test-series",
    });

    expectSuccess(result);
  });

  it("should succeed with posts in series", async () => {
    const entityService = harness.getEntityService();

    await entityService.createEntity(createMockSeries("AI Learning"));
    await entityService.createEntity(
      createSeriesPost(
        "intro-to-ml",
        "Introduction to Machine Learning",
        "Learn the basics of ML",
        "AI Learning",
      ),
    );
    await entityService.createEntity(
      createSeriesPost(
        "deep-learning",
        "Deep Learning Fundamentals",
        "Understanding neural networks",
        "AI Learning",
      ),
    );

    const result = await harness.executeTool("blog_enhance-series", {
      seriesId: "ai-learning",
    });

    expectSuccess(result);
    expect(result.data).toBeDefined();
  });
});
