import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import type { BlogPost } from "../src/schemas/blog-post";
import type { IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import {
  createMockLogger,
  createMockEntityService,
  createTestEntity,
} from "@brains/test-utils";
import { SeriesRouteGenerator } from "../src/routes/series-route-generator";

describe("SeriesRouteGenerator", () => {
  let generator: SeriesRouteGenerator;
  let mockEntityService: IEntityService;
  let mockLogger: Logger;

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
    return createTestEntity<BlogPost>("post", {
      id,
      content,
      metadata: {
        title,
        slug,
        status: "published",
        publishedAt: "2025-01-01T10:00:00.000Z",
        seriesName,
        seriesIndex,
      },
    });
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockEntityService = createMockEntityService();
    generator = new SeriesRouteGenerator(mockEntityService, mockLogger);
  });

  describe("generateRoutes", () => {
    it("should always include series list route", async () => {
      spyOn(mockEntityService, "listEntities").mockResolvedValue([]);

      const routes = await generator.generateRoutes();

      expect(routes).toHaveLength(1);
      expect(routes[0]).toMatchObject({
        id: "series-list",
        path: "/series",
        title: "Series",
      });
    });

    it("should generate detail routes for each unique series", async () => {
      const posts = [
        createMockPost("1", "Post 1", "post-1", "New Institutions", 1),
        createMockPost("2", "Post 2", "post-2", "New Institutions", 2),
        createMockPost("3", "Post 3", "post-3", "Other Series", 1),
        createMockPost("4", "Post 4", "post-4"), // No series
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(posts);

      const routes = await generator.generateRoutes();

      expect(routes).toHaveLength(3); // list + 2 detail
      expect(routes.map((r) => r.path).sort()).toEqual([
        "/series",
        "/series/new-institutions",
        "/series/other-series",
      ]);
    });

    it("should generate route with correct data query", async () => {
      const posts = [
        createMockPost("1", "Post 1", "post-1", "New Institutions", 1),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(posts);

      const routes = await generator.generateRoutes();
      const detailRoute = routes.find(
        (r) => r.path === "/series/new-institutions",
      );

      expect(detailRoute).toMatchObject({
        id: "series-detail-new-institutions",
        path: "/series/new-institutions",
        title: "Series: New Institutions",
        sections: [
          {
            id: "detail",
            template: "blog:series-detail",
            dataQuery: { type: "detail", seriesName: "New Institutions" },
          },
        ],
      });
    });

    it("should slugify series names for URLs", async () => {
      const posts = [
        createMockPost("1", "Post 1", "post-1", "The Future of Work", 1),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(posts);

      const routes = await generator.generateRoutes();

      expect(
        routes.find((r) => r.path === "/series/the-future-of-work"),
      ).toBeDefined();
    });

    it("should mark routes with sourceEntityType for cleanup", async () => {
      const posts = [createMockPost("1", "Post 1", "post-1", "Test Series", 1)];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(posts);

      const routes = await generator.generateRoutes();

      for (const route of routes) {
        expect(route.sourceEntityType).toBe("post");
      }
    });
  });
});
