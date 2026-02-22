import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import type { IEntityService, BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { createMockLogger, createMockEntityService } from "@brains/test-utils";
import { z } from "zod";
import { SeriesDataSource } from "../src/datasources/series-datasource";
import { createMockPost, createMockSeries } from "./fixtures/blog-entities";

const seriesListSchema = z.object({
  series: z.array(
    z
      .object({
        frontmatter: z.object({
          title: z.string(),
          slug: z.string(),
        }),
        postCount: z.number(),
      })
      .passthrough(),
  ),
});

const seriesDetailSchema = z
  .object({
    seriesName: z.string(),
    posts: z.array(z.object({ id: z.string() })),
  })
  .passthrough();

describe("SeriesDataSource", () => {
  let datasource: SeriesDataSource;
  let mockEntityService: IEntityService;
  let mockLogger: Logger;
  let mockContext: BaseDataSourceContext;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockEntityService = createMockEntityService();
    mockContext = { entityService: mockEntityService };
    datasource = new SeriesDataSource(mockLogger);
  });

  function mockSeriesAndPosts(): void {
    const seriesEntities = [
      createMockSeries("New Institutions"),
      createMockSeries("Other Series"),
    ];
    const posts = [
      createMockPost("1", "Post 1", "post-1", "published", {
        seriesName: "New Institutions",
        seriesIndex: 1,
      }),
      createMockPost("2", "Post 2", "post-2", "published", {
        seriesName: "New Institutions",
        seriesIndex: 2,
      }),
      createMockPost("3", "Post 3", "post-3", "published", {
        seriesName: "Other Series",
        seriesIndex: 1,
      }),
    ];

    spyOn(mockEntityService, "listEntities").mockImplementation(((
      entityType: string,
    ) => {
      if (entityType === "series") return Promise.resolve(seriesEntities);
      if (entityType === "post") return Promise.resolve(posts);
      return Promise.resolve([]);
    }) as typeof mockEntityService.listEntities);
  }

  describe("fetchSeriesList", () => {
    it("should return all series entities", async () => {
      mockSeriesAndPosts();

      const result = await datasource.fetch(
        { type: "list" },
        seriesListSchema,
        mockContext,
      );

      expect(result.series).toHaveLength(2);

      const ni = result.series.find(
        (s) => s.frontmatter.title === "New Institutions",
      );
      expect(ni).toBeDefined();
      expect(ni?.frontmatter.slug).toBe("new-institutions");
      expect(ni?.postCount).toBe(2);

      const os = result.series.find(
        (s) => s.frontmatter.title === "Other Series",
      );
      expect(os).toBeDefined();
      expect(os?.frontmatter.slug).toBe("other-series");
      expect(os?.postCount).toBe(1);
    });

    it("should return empty array when no series exist", async () => {
      spyOn(mockEntityService, "listEntities").mockImplementation(() =>
        Promise.resolve([]),
      );

      const result = await datasource.fetch(
        { type: "list" },
        seriesListSchema,
        mockContext,
      );

      expect(result.series).toHaveLength(0);
    });
  });

  describe("fetchSeriesDetail", () => {
    it("should return posts for a specific series", async () => {
      const seriesEntity = createMockSeries("New Institutions");
      const posts = [
        createMockPost("1", "Post 1", "post-1", "published", {
          seriesName: "New Institutions",
          seriesIndex: 1,
        }),
        createMockPost("2", "Post 2", "post-2", "published", {
          seriesName: "New Institutions",
          seriesIndex: 2,
        }),
      ];

      const listSpy = spyOn(mockEntityService, "listEntities");
      listSpy.mockResolvedValueOnce([seriesEntity]);
      listSpy.mockResolvedValueOnce(posts);

      const result = await datasource.fetch(
        { type: "detail", seriesName: "New Institutions" },
        seriesDetailSchema,
        mockContext,
      );

      expect(result.seriesName).toBe("New Institutions");
      expect(result.posts).toHaveLength(2);
    });
  });

  describe("DynamicRouteGenerator query format", () => {
    it("should handle list query with entityType format", async () => {
      mockSeriesAndPosts();

      const result = await datasource.fetch(
        { entityType: "series", query: { limit: 100 } },
        seriesListSchema,
        mockContext,
      );

      expect(result.series).toHaveLength(2);
      const ni = result.series.find(
        (s) => s.frontmatter.title === "New Institutions",
      );
      expect(ni).toBeDefined();
      expect(ni?.frontmatter.slug).toBe("new-institutions");
      expect(ni?.postCount).toBe(2);
    });

    it("should handle detail query with entityType format using id as slug", async () => {
      const seriesEntities = [createMockSeries("New Institutions")];
      const posts = [
        createMockPost("1", "Post 1", "post-1", "published", {
          seriesName: "New Institutions",
          seriesIndex: 1,
        }),
        createMockPost("2", "Post 2", "post-2", "published", {
          seriesName: "New Institutions",
          seriesIndex: 2,
        }),
      ];

      const listSpy = spyOn(mockEntityService, "listEntities");
      listSpy.mockResolvedValueOnce(seriesEntities);
      listSpy.mockResolvedValueOnce(posts);

      const result = await datasource.fetch(
        { entityType: "series", query: { id: "new-institutions" } },
        seriesDetailSchema,
        mockContext,
      );

      expect(result.seriesName).toBe("New Institutions");
      expect(result.posts).toHaveLength(2);
    });

    it("should handle paginated list query", async () => {
      const seriesEntities = [
        createMockSeries("Series A"),
        createMockSeries("Series B"),
      ];
      const posts = [
        createMockPost("1", "Post 1", "post-1", "published", {
          seriesName: "Series A",
          seriesIndex: 1,
        }),
        createMockPost("2", "Post 2", "post-2", "published", {
          seriesName: "Series A",
          seriesIndex: 2,
        }),
        createMockPost("3", "Post 3", "post-3", "published", {
          seriesName: "Series A",
          seriesIndex: 3,
        }),
        createMockPost("4", "Post 4", "post-4", "published", {
          seriesName: "Series B",
          seriesIndex: 1,
        }),
        createMockPost("5", "Post 5", "post-5", "published", {
          seriesName: "Series B",
          seriesIndex: 2,
        }),
      ];

      spyOn(mockEntityService, "listEntities").mockImplementation(((
        entityType: string,
      ) => {
        if (entityType === "series") return Promise.resolve(seriesEntities);
        if (entityType === "post") return Promise.resolve(posts);
        return Promise.resolve([]);
      }) as typeof mockEntityService.listEntities);

      const result = await datasource.fetch(
        {
          entityType: "series",
          query: { page: 1, pageSize: 10, baseUrl: "/series" },
        },
        seriesListSchema,
        mockContext,
      );

      expect(result.series).toHaveLength(2);
    });
  });
});
