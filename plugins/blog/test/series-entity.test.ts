import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import type { IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import {
  createMockLogger,
  createMockEntityService,
  createTestEntity,
} from "@brains/test-utils";
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
        entityId: "new-institutions",
        jobId: "job-1",
        created: true,
      });

      await manager.syncSeriesFromPosts();

      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(upsertSpy.mock.calls[0]?.[0]).toMatchObject({
        id: "new-institutions",
        metadata: {
          title: "New Institutions",
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
        entityId: "new-institutions",
        jobId: "job-1",
        created: true,
      });

      await manager.syncSeriesFromPosts();

      // Should only create one series entity (postCount computed dynamically when fetching)
      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(upsertSpy.mock.calls[0]?.[0]).toMatchObject({
        id: "new-institutions",
        metadata: {
          title: "New Institutions",
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
        entityId: "test",
        jobId: "job-1",
        created: true,
      });

      await manager.syncSeriesFromPosts();

      expect(upsertSpy).toHaveBeenCalledTimes(2);

      const seriesIds = upsertSpy.mock.calls.map(
        (call) => (call[0] as unknown as { id: string }).id,
      );
      expect(seriesIds).toContain("new-institutions");
      expect(seriesIds).toContain("future-of-work");
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
        entityId: "new-institutions",
        jobId: "job-1",
        created: true,
      });

      await manager.syncSeriesFromPosts();

      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(upsertSpy.mock.calls[0]?.[0]).toMatchObject({
        id: "new-institutions",
        metadata: {
          title: "New Institutions",
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
            id: "old-series",
            entityType: "series",
            content: "",
            contentHash: "",
            created: "",
            updated: "",
            metadata: { title: "Old Series", slug: "old-series" },
          },
        ]); // series

      const deleteSpy = spyOn(
        mockEntityService,
        "deleteEntity",
      ).mockResolvedValue(true);

      await manager.syncSeriesFromPosts();

      expect(deleteSpy).toHaveBeenCalledWith("series", "old-series");
    });

    it("should use slugified name as entity ID (without prefix)", async () => {
      const posts = [
        createMockPost("1", "Post 1", "post-1", "The Future of Work", 1),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(posts);
      const upsertSpy = spyOn(
        mockEntityService,
        "upsertEntity",
      ).mockResolvedValue({
        entityId: "the-future-of-work",
        jobId: "job-1",
        created: true,
      });

      await manager.syncSeriesFromPosts();

      expect(upsertSpy.mock.calls[0]?.[0]).toMatchObject({
        id: "the-future-of-work",
        metadata: {
          slug: "the-future-of-work",
        },
      });
    });
  });

  describe("handlePostChange", () => {
    it("should ensure series exists when post with seriesName is created", async () => {
      const post = createMockPost(
        "1",
        "Post 1",
        "post-1",
        "New Institutions",
        1,
      );

      // Series doesn't exist yet
      spyOn(mockEntityService, "getEntity").mockResolvedValue(null);
      const upsertSpy = spyOn(
        mockEntityService,
        "upsertEntity",
      ).mockResolvedValue({
        entityId: "new-institutions",
        jobId: "job-1",
        created: true,
      });

      await manager.handlePostChange(post);

      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(upsertSpy.mock.calls[0]?.[0]).toMatchObject({
        id: "new-institutions",
        metadata: {
          title: "New Institutions",
          slug: "new-institutions",
        },
      });
    });

    it("should not create series if it already exists", async () => {
      const post = createMockPost(
        "1",
        "Post 1",
        "post-1",
        "New Institutions",
        1,
      );

      // Series already exists
      spyOn(mockEntityService, "getEntity").mockResolvedValue({
        id: "new-institutions",
        entityType: "series",
        content: "",
        contentHash: "",
        created: "",
        updated: "",
        metadata: { title: "New Institutions", slug: "new-institutions" },
      });
      const upsertSpy = spyOn(
        mockEntityService,
        "upsertEntity",
      ).mockResolvedValue({
        entityId: "new-institutions",
        jobId: "job-1",
        created: false,
      });

      await manager.handlePostChange(post);

      // Should NOT upsert since series already exists
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    it("should not query when post has no seriesName", async () => {
      const post = createMockPost("1", "Post 1", "post-1"); // No series

      const getSpy = spyOn(mockEntityService, "getEntity").mockResolvedValue(
        null,
      );

      await manager.handlePostChange(post);

      // Should not query since this post has no series
      expect(getSpy).not.toHaveBeenCalled();
    });
  });

  describe("ensureSeriesExists", () => {
    it("should create series if it does not exist", async () => {
      spyOn(mockEntityService, "getEntity").mockResolvedValue(null);
      const upsertSpy = spyOn(
        mockEntityService,
        "upsertEntity",
      ).mockResolvedValue({
        entityId: "new-institutions",
        jobId: "job-1",
        created: true,
      });

      await manager.ensureSeriesExists("New Institutions");

      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(upsertSpy.mock.calls[0]?.[0]).toMatchObject({
        id: "new-institutions",
        entityType: "series",
        metadata: {
          title: "New Institutions",
          slug: "new-institutions",
        },
      });
    });

    it("should not create series if it already exists", async () => {
      spyOn(mockEntityService, "getEntity").mockResolvedValue({
        id: "new-institutions",
        entityType: "series",
        content: "",
        contentHash: "",
        created: "",
        updated: "",
        metadata: { title: "New Institutions", slug: "new-institutions" },
      });
      const upsertSpy = spyOn(
        mockEntityService,
        "upsertEntity",
      ).mockResolvedValue({
        entityId: "new-institutions",
        jobId: "job-1",
        created: false,
      });

      await manager.ensureSeriesExists("New Institutions");

      expect(upsertSpy).not.toHaveBeenCalled();
    });

    it("should generate proper frontmatter content", async () => {
      spyOn(mockEntityService, "getEntity").mockResolvedValue(null);
      const upsertSpy = spyOn(
        mockEntityService,
        "upsertEntity",
      ).mockResolvedValue({
        entityId: "my-series",
        jobId: "job-1",
        created: true,
      });

      await manager.ensureSeriesExists("My Series");

      const createdEntity = upsertSpy.mock.calls[0]?.[0] as { content: string };
      // Content should have frontmatter with title and slug
      expect(createdEntity.content).toContain("title: My Series");
      expect(createdEntity.content).toContain("slug: my-series");
    });
  });

  describe("cleanupOrphanedSeries", () => {
    it("should delete series if no posts reference it", async () => {
      // Series exists
      spyOn(mockEntityService, "getEntity").mockResolvedValue({
        id: "old-series",
        entityType: "series",
        content: "",
        contentHash: "",
        created: "",
        updated: "",
        metadata: { title: "Old Series", slug: "old-series" },
      });
      // No posts reference this series
      spyOn(mockEntityService, "listEntities").mockResolvedValue([]);
      const deleteSpy = spyOn(
        mockEntityService,
        "deleteEntity",
      ).mockResolvedValue(true);

      await manager.cleanupOrphanedSeries("Old Series");

      expect(deleteSpy).toHaveBeenCalledWith("series", "old-series");
    });

    it("should not delete series if posts still reference it", async () => {
      const post = createMockPost("1", "Post 1", "post-1", "Old Series", 1);

      spyOn(mockEntityService, "getEntity").mockResolvedValue({
        id: "old-series",
        entityType: "series",
        content: "",
        contentHash: "",
        created: "",
        updated: "",
        metadata: { title: "Old Series", slug: "old-series" },
      });
      // One post still references this series
      spyOn(mockEntityService, "listEntities").mockResolvedValue([post]);
      const deleteSpy = spyOn(
        mockEntityService,
        "deleteEntity",
      ).mockResolvedValue(true);

      await manager.cleanupOrphanedSeries("Old Series");

      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("should do nothing if series does not exist", async () => {
      spyOn(mockEntityService, "getEntity").mockResolvedValue(null);
      const listSpy = spyOn(
        mockEntityService,
        "listEntities",
      ).mockResolvedValue([]);
      const deleteSpy = spyOn(
        mockEntityService,
        "deleteEntity",
      ).mockResolvedValue(true);

      await manager.cleanupOrphanedSeries("Non Existent");

      // Should not query posts or delete if series doesn't exist
      expect(listSpy).not.toHaveBeenCalled();
      expect(deleteSpy).not.toHaveBeenCalled();
    });
  });

  describe("handlePostDelete", () => {
    it("should cleanup orphaned series when post is deleted", async () => {
      const post = createMockPost("1", "Post 1", "post-1", "Old Series", 1);

      // Series exists
      spyOn(mockEntityService, "getEntity").mockResolvedValue({
        id: "old-series",
        entityType: "series",
        content: "",
        contentHash: "",
        created: "",
        updated: "",
        metadata: { title: "Old Series", slug: "old-series" },
      });
      // No other posts reference this series
      spyOn(mockEntityService, "listEntities").mockResolvedValue([]);
      const deleteSpy = spyOn(
        mockEntityService,
        "deleteEntity",
      ).mockResolvedValue(true);

      await manager.handlePostDelete(post);

      expect(deleteSpy).toHaveBeenCalledWith("series", "old-series");
    });

    it("should do nothing when deleted post has no seriesName", async () => {
      const post = createMockPost("1", "Post 1", "post-1"); // No series

      const getSpy = spyOn(mockEntityService, "getEntity").mockResolvedValue(
        null,
      );

      await manager.handlePostDelete(post);

      expect(getSpy).not.toHaveBeenCalled();
    });
  });

  describe("handlePostChange with oldSeriesName", () => {
    it("should cleanup old series when post moves to new series", async () => {
      const post = createMockPost("1", "Post 1", "post-1", "New Series", 1);

      // New series doesn't exist yet
      const getEntitySpy = spyOn(mockEntityService, "getEntity");
      getEntitySpy
        .mockResolvedValueOnce(null) // New Series doesn't exist
        .mockResolvedValueOnce({
          // Old Series exists
          id: "old-series",
          entityType: "series",
          content: "",
          contentHash: "",
          created: "",
          updated: "",
          metadata: { title: "Old Series", slug: "old-series" },
        });

      // No posts reference old series anymore
      spyOn(mockEntityService, "listEntities").mockResolvedValue([]);

      const upsertSpy = spyOn(
        mockEntityService,
        "upsertEntity",
      ).mockResolvedValue({
        entityId: "new-series",
        jobId: "job-1",
        created: true,
      });
      const deleteSpy = spyOn(
        mockEntityService,
        "deleteEntity",
      ).mockResolvedValue(true);

      await manager.handlePostChange(post, "Old Series");

      // Should create new series
      expect(upsertSpy).toHaveBeenCalled();
      // Should delete old orphaned series
      expect(deleteSpy).toHaveBeenCalledWith("series", "old-series");
    });

    it("should not cleanup if old and new series are the same", async () => {
      const post = createMockPost("1", "Post 1", "post-1", "Same Series", 1);

      spyOn(mockEntityService, "getEntity").mockResolvedValue({
        id: "same-series",
        entityType: "series",
        content: "",
        contentHash: "",
        created: "",
        updated: "",
        metadata: { title: "Same Series", slug: "same-series" },
      });
      const deleteSpy = spyOn(
        mockEntityService,
        "deleteEntity",
      ).mockResolvedValue(true);

      await manager.handlePostChange(post, "Same Series");

      expect(deleteSpy).not.toHaveBeenCalled();
    });
  });
});
