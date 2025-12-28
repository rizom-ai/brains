import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import type { BlogPost } from "../src/schemas/blog-post";
import type { Series } from "../src/schemas/series";
import type { IEntityService, Logger } from "@brains/plugins";
import type { BaseDataSourceContext } from "@brains/datasource";
import { createMockLogger, createMockEntityService } from "@brains/test-utils";
import { computeContentHash } from "@brains/utils";
import { z } from "zod";
import { SeriesDataSource } from "../src/datasources/series-datasource";

describe("SeriesDataSource", () => {
  let datasource: SeriesDataSource;
  let mockEntityService: IEntityService;
  let mockLogger: Logger;
  let mockContext: BaseDataSourceContext;

  const createMockPost = (
    id: string,
    title: string,
    slug: string,
    seriesName?: string,
    seriesIndex?: number,
  ): BlogPost => {
    const content = `---
title: ${title}
slug: ${slug}
status: published
publishedAt: "2025-01-01T10:00:00.000Z"
excerpt: Excerpt for ${title}
author: Test Author
${seriesName ? `seriesName: ${seriesName}` : ""}
${seriesIndex ? `seriesIndex: ${seriesIndex}` : ""}
---

# ${title}

Content for ${title}`;
    return {
      id,
      entityType: "post",
      content,
      contentHash: computeContentHash(content),
      created: "2025-01-01T10:00:00.000Z",
      updated: "2025-01-01T10:00:00.000Z",
      metadata: {
        title,
        slug,
        status: "published",
        publishedAt: "2025-01-01T10:00:00.000Z",
        seriesName,
        seriesIndex,
      },
    };
  };

  const createMockSeries = (
    name: string,
    slug: string,
    postCount: number,
  ): Series => ({
    id: `series-${slug}`,
    entityType: "series",
    content: `# ${name}`,
    contentHash: computeContentHash(`# ${name}`),
    created: "2025-01-01T10:00:00.000Z",
    updated: "2025-01-01T10:00:00.000Z",
    metadata: { name, slug, postCount },
  });

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockEntityService = createMockEntityService();
    mockContext = {};
    datasource = new SeriesDataSource(mockEntityService, mockLogger);
  });

  describe("fetchSeriesList", () => {
    it("should return all series entities", async () => {
      const seriesEntities = [
        createMockSeries("New Institutions", "new-institutions", 2),
        createMockSeries("Other Series", "other-series", 1),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(
        seriesEntities,
      );

      const schema = z.object({
        series: z.array(
          z.object({
            name: z.string(),
            slug: z.string(),
            postCount: z.number(),
          }),
        ),
      });

      const result = await datasource.fetch(
        { type: "list" },
        schema,
        mockContext,
      );

      expect(result.series).toHaveLength(2);
      expect(result.series).toContainEqual({
        name: "New Institutions",
        slug: "new-institutions",
        postCount: 2,
      });
      expect(result.series).toContainEqual({
        name: "Other Series",
        slug: "other-series",
        postCount: 1,
      });
    });

    it("should return empty array when no series exist", async () => {
      spyOn(mockEntityService, "listEntities").mockResolvedValue([]);

      const schema = z.object({
        series: z.array(
          z.object({
            name: z.string(),
            slug: z.string(),
            postCount: z.number(),
          }),
        ),
      });

      const result = await datasource.fetch(
        { type: "list" },
        schema,
        mockContext,
      );

      expect(result.series).toHaveLength(0);
    });
  });

  describe("fetchSeriesDetail", () => {
    it("should return posts for a specific series", async () => {
      const posts = [
        createMockPost("1", "Post 1", "post-1", "New Institutions", 1),
        createMockPost("2", "Post 2", "post-2", "New Institutions", 2),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(posts);

      const schema = z.object({
        seriesName: z.string(),
        posts: z.array(z.object({ id: z.string() })),
      });

      const result = await datasource.fetch(
        { type: "detail", seriesName: "New Institutions" },
        schema,
        mockContext,
      );

      expect(result.seriesName).toBe("New Institutions");
      expect(result.posts).toHaveLength(2);
    });
  });

  describe("DynamicRouteGenerator query format", () => {
    it("should handle list query with entityType format", async () => {
      const seriesEntities = [
        createMockSeries("New Institutions", "new-institutions", 2),
        createMockSeries("Other Series", "other-series", 1),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(
        seriesEntities,
      );

      const schema = z.object({
        series: z.array(
          z.object({
            name: z.string(),
            slug: z.string(),
            postCount: z.number(),
          }),
        ),
      });

      // DynamicRouteGenerator query format for list
      const result = await datasource.fetch(
        { entityType: "series", query: { limit: 100 } },
        schema,
        mockContext,
      );

      expect(result.series).toHaveLength(2);
      expect(result.series).toContainEqual({
        name: "New Institutions",
        slug: "new-institutions",
        postCount: 2,
      });
    });

    it("should handle detail query with entityType format using id as slug", async () => {
      const seriesEntities = [
        createMockSeries("New Institutions", "new-institutions", 2),
      ];
      const posts = [
        createMockPost("1", "Post 1", "post-1", "New Institutions", 1),
        createMockPost("2", "Post 2", "post-2", "New Institutions", 2),
      ];

      const listSpy = spyOn(mockEntityService, "listEntities");
      // First call returns the series entity to get the seriesName from slug
      listSpy.mockResolvedValueOnce(seriesEntities);
      // Second call returns posts for that series
      listSpy.mockResolvedValueOnce(posts);

      const schema = z.object({
        seriesName: z.string(),
        posts: z.array(z.object({ id: z.string() })),
      });

      // DynamicRouteGenerator query format for detail (id = slug)
      const result = await datasource.fetch(
        { entityType: "series", query: { id: "new-institutions" } },
        schema,
        mockContext,
      );

      expect(result.seriesName).toBe("New Institutions");
      expect(result.posts).toHaveLength(2);
    });

    it("should handle paginated list query", async () => {
      const seriesEntities = [
        createMockSeries("Series A", "series-a", 3),
        createMockSeries("Series B", "series-b", 2),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(
        seriesEntities,
      );

      const schema = z.object({
        series: z.array(
          z.object({
            name: z.string(),
            slug: z.string(),
            postCount: z.number(),
          }),
        ),
      });

      // Paginated query format
      const result = await datasource.fetch(
        {
          entityType: "series",
          query: { page: 1, pageSize: 10, baseUrl: "/series" },
        },
        schema,
        mockContext,
      );

      expect(result.series).toHaveLength(2);
    });
  });
});
