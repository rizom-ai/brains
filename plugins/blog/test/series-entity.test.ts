import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import type { IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { createMockLogger, createMockEntityService } from "@brains/test-utils";
import { computeContentHash } from "@brains/utils";
import type { BlogPost } from "../src/schemas/blog-post";
import { SeriesManager } from "../src/services/series-manager";

describe("SeriesManager", () => {
  let manager: SeriesManager;
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
${seriesIndex !== undefined ? `seriesIndex: ${seriesIndex}` : ""}
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

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockEntityService = createMockEntityService();
    manager = new SeriesManager(mockEntityService, mockLogger);
  });

  describe("syncSeriesFromPosts", () => {
    it("should create series entity when post has seriesName", async () => {
      const posts = [
        createMockPost("1", "Post 1", "post-1", "New Institutions", 1),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(posts);
      const upsertSpy = spyOn(
        mockEntityService,
        "upsertEntity",
      ).mockResolvedValue({
        entityId: "series-new-institutions",
        jobId: "job-1",
        created: true,
      });

      await manager.syncSeriesFromPosts();

      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(upsertSpy.mock.calls[0]?.[0]).toMatchObject({
        metadata: {
          name: "New Institutions",
          slug: "new-institutions",
        },
      });
    });

    it("should create one entity for multiple posts in same series", async () => {
      const posts = [
        createMockPost("1", "Post 1", "post-1", "New Institutions", 1),
        createMockPost("2", "Post 2", "post-2", "New Institutions", 2),
        createMockPost("3", "Post 3", "post-3", "New Institutions", 3),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(posts);
      const upsertSpy = spyOn(
        mockEntityService,
        "upsertEntity",
      ).mockResolvedValue({
        entityId: "series-new-institutions",
        jobId: "job-1",
        created: true,
      });

      await manager.syncSeriesFromPosts();

      // Should only create one series entity (postCount computed dynamically when fetching)
      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(upsertSpy.mock.calls[0]?.[0]).toMatchObject({
        metadata: {
          name: "New Institutions",
          slug: "new-institutions",
        },
      });
    });

    it("should create separate entities for different series", async () => {
      const posts = [
        createMockPost("1", "Post 1", "post-1", "New Institutions", 1),
        createMockPost("2", "Post 2", "post-2", "Future of Work", 1),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(posts);
      const upsertSpy = spyOn(
        mockEntityService,
        "upsertEntity",
      ).mockResolvedValue({
        entityId: "series-test",
        jobId: "job-1",
        created: true,
      });

      await manager.syncSeriesFromPosts();

      expect(upsertSpy).toHaveBeenCalledTimes(2);

      const seriesNames = upsertSpy.mock.calls.map(
        (call) =>
          (call[0] as unknown as { metadata: { name: string } }).metadata.name,
      );
      expect(seriesNames).toContain("New Institutions");
      expect(seriesNames).toContain("Future of Work");
    });

    it("should ignore posts without seriesName", async () => {
      const posts = [
        createMockPost("1", "Post 1", "post-1"), // No series
        createMockPost("2", "Post 2", "post-2", "New Institutions", 1),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(posts);
      const upsertSpy = spyOn(
        mockEntityService,
        "upsertEntity",
      ).mockResolvedValue({
        entityId: "series-new-institutions",
        jobId: "job-1",
        created: true,
      });

      await manager.syncSeriesFromPosts();

      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(upsertSpy.mock.calls[0]?.[0]).toMatchObject({
        metadata: {
          name: "New Institutions",
          slug: "new-institutions",
        },
      });
    });

    it("should delete series entities that no longer have posts", async () => {
      // No posts with series - first call returns posts, second call returns series
      const listSpy = spyOn(mockEntityService, "listEntities");
      listSpy
        .mockResolvedValueOnce([]) // posts
        .mockResolvedValueOnce([
          {
            id: "series-old-series",
            entityType: "series",
            content: "",
            contentHash: "",
            created: "",
            updated: "",
            metadata: { name: "Old Series", slug: "old-series" },
          },
        ]); // series

      const deleteSpy = spyOn(
        mockEntityService,
        "deleteEntity",
      ).mockResolvedValue(true);

      await manager.syncSeriesFromPosts();

      expect(deleteSpy).toHaveBeenCalledWith("series", "series-old-series");
    });

    it("should use slugified name as entity ID", async () => {
      const posts = [
        createMockPost("1", "Post 1", "post-1", "The Future of Work", 1),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(posts);
      const upsertSpy = spyOn(
        mockEntityService,
        "upsertEntity",
      ).mockResolvedValue({
        entityId: "series-the-future-of-work",
        jobId: "job-1",
        created: true,
      });

      await manager.syncSeriesFromPosts();

      expect(upsertSpy.mock.calls[0]?.[0]).toMatchObject({
        id: "series-the-future-of-work",
        metadata: {
          slug: "the-future-of-work",
        },
      });
    });
  });

  describe("handlePostChange", () => {
    it("should sync series when post with seriesName is created", async () => {
      const post = createMockPost(
        "1",
        "Post 1",
        "post-1",
        "New Institutions",
        1,
      );

      spyOn(mockEntityService, "listEntities").mockResolvedValue([post]);
      const upsertSpy = spyOn(
        mockEntityService,
        "upsertEntity",
      ).mockResolvedValue({
        entityId: "series-new-institutions",
        jobId: "job-1",
        created: true,
      });

      await manager.handlePostChange(post);

      expect(upsertSpy).toHaveBeenCalled();
    });

    it("should not sync when post has no seriesName", async () => {
      const post = createMockPost("1", "Post 1", "post-1"); // No series

      const listSpy = spyOn(
        mockEntityService,
        "listEntities",
      ).mockResolvedValue([]);

      await manager.handlePostChange(post);

      // Should not query for posts since this post has no series
      expect(listSpy).not.toHaveBeenCalled();
    });
  });
});
