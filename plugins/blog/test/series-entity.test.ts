import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import type { IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { createMockLogger, createMockEntityService } from "@brains/test-utils";
import { SeriesManager } from "../src/services/series-manager";
import { createMockPost } from "./fixtures/blog-entities";

describe("SeriesManager", () => {
  let manager: SeriesManager;
  let mockEntityService: IEntityService;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockEntityService = createMockEntityService();
    manager = new SeriesManager(mockEntityService, mockLogger);
  });

  function stubUpsert(): ReturnType<
    typeof spyOn<IEntityService, "upsertEntity">
  > {
    return spyOn(mockEntityService, "upsertEntity").mockResolvedValue({
      entityId: "test",
      jobId: "job-1",
      created: true,
    });
  }

  describe("syncSeriesFromPosts", () => {
    it("should create series entity when post has seriesName", async () => {
      const posts = [
        createMockPost("1", "Post 1", "post-1", "published", {
          seriesName: "New Institutions",
          seriesIndex: 1,
        }),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(posts);
      const upsertSpy = stubUpsert();

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
        createMockPost("1", "Post 1", "post-1", "published", {
          seriesName: "New Institutions",
          seriesIndex: 1,
        }),
        createMockPost("2", "Post 2", "post-2", "published", {
          seriesName: "New Institutions",
          seriesIndex: 2,
        }),
        createMockPost("3", "Post 3", "post-3", "published", {
          seriesName: "New Institutions",
          seriesIndex: 3,
        }),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(posts);
      const upsertSpy = stubUpsert();

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

    it("should create separate entities for different series", async () => {
      const posts = [
        createMockPost("1", "Post 1", "post-1", "published", {
          seriesName: "New Institutions",
          seriesIndex: 1,
        }),
        createMockPost("2", "Post 2", "post-2", "published", {
          seriesName: "Future of Work",
          seriesIndex: 1,
        }),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(posts);
      const upsertSpy = stubUpsert();

      await manager.syncSeriesFromPosts();

      expect(upsertSpy).toHaveBeenCalledTimes(2);

      expect(upsertSpy.mock.calls[0]?.[0]).toMatchObject({
        id: "new-institutions",
      });
      expect(upsertSpy.mock.calls[1]?.[0]).toMatchObject({
        id: "future-of-work",
      });
    });

    it("should ignore posts without seriesName", async () => {
      const posts = [
        createMockPost("1", "Post 1", "post-1", "published"),
        createMockPost("2", "Post 2", "post-2", "published", {
          seriesName: "New Institutions",
          seriesIndex: 1,
        }),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(posts);
      const upsertSpy = stubUpsert();

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
      const listSpy = spyOn(mockEntityService, "listEntities");
      listSpy.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: "old-series",
          entityType: "series",
          content: "",
          contentHash: "",
          created: "",
          updated: "",
          metadata: { title: "Old Series", slug: "old-series" },
        },
      ]);

      const deleteSpy = spyOn(
        mockEntityService,
        "deleteEntity",
      ).mockResolvedValue(true);

      await manager.syncSeriesFromPosts();

      expect(deleteSpy).toHaveBeenCalledWith("series", "old-series");
    });

    it("should use slugified name as entity ID (without prefix)", async () => {
      const posts = [
        createMockPost("1", "Post 1", "post-1", "published", {
          seriesName: "The Future of Work",
          seriesIndex: 1,
        }),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(posts);
      const upsertSpy = stubUpsert();

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
      const post = createMockPost("1", "Post 1", "post-1", "published", {
        seriesName: "New Institutions",
        seriesIndex: 1,
      });

      spyOn(mockEntityService, "getEntity").mockResolvedValue(null);
      const upsertSpy = stubUpsert();

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
      const post = createMockPost("1", "Post 1", "post-1", "published", {
        seriesName: "New Institutions",
        seriesIndex: 1,
      });

      spyOn(mockEntityService, "getEntity").mockResolvedValue({
        id: "new-institutions",
        entityType: "series",
        content: "",
        contentHash: "",
        created: "",
        updated: "",
        metadata: { title: "New Institutions", slug: "new-institutions" },
      });
      const upsertSpy = stubUpsert();

      await manager.handlePostChange(post);

      expect(upsertSpy).not.toHaveBeenCalled();
    });

    it("should not query when post has no seriesName", async () => {
      const post = createMockPost("1", "Post 1", "post-1", "published");

      const getSpy = spyOn(mockEntityService, "getEntity").mockResolvedValue(
        null,
      );

      await manager.handlePostChange(post);

      expect(getSpy).not.toHaveBeenCalled();
    });
  });

  describe("ensureSeriesExists", () => {
    it("should create series if it does not exist", async () => {
      spyOn(mockEntityService, "getEntity").mockResolvedValue(null);
      const upsertSpy = stubUpsert();

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
      const upsertSpy = stubUpsert();

      await manager.ensureSeriesExists("New Institutions");

      expect(upsertSpy).not.toHaveBeenCalled();
    });

    it("should generate proper frontmatter content", async () => {
      spyOn(mockEntityService, "getEntity").mockResolvedValue(null);
      const upsertSpy = stubUpsert();

      await manager.ensureSeriesExists("My Series");

      const createdEntity = upsertSpy.mock.calls[0]?.[0] as { content: string };
      expect(createdEntity.content).toContain("title: My Series");
      expect(createdEntity.content).toContain("slug: my-series");
    });
  });

  describe("cleanupOrphanedSeries", () => {
    it("should delete series if no posts reference it", async () => {
      spyOn(mockEntityService, "getEntity").mockResolvedValue({
        id: "old-series",
        entityType: "series",
        content: "",
        contentHash: "",
        created: "",
        updated: "",
        metadata: { title: "Old Series", slug: "old-series" },
      });
      spyOn(mockEntityService, "listEntities").mockResolvedValue([]);
      const deleteSpy = spyOn(
        mockEntityService,
        "deleteEntity",
      ).mockResolvedValue(true);

      await manager.cleanupOrphanedSeries("Old Series");

      expect(deleteSpy).toHaveBeenCalledWith("series", "old-series");
    });

    it("should not delete series if posts still reference it", async () => {
      const post = createMockPost("1", "Post 1", "post-1", "published", {
        seriesName: "Old Series",
        seriesIndex: 1,
      });

      spyOn(mockEntityService, "getEntity").mockResolvedValue({
        id: "old-series",
        entityType: "series",
        content: "",
        contentHash: "",
        created: "",
        updated: "",
        metadata: { title: "Old Series", slug: "old-series" },
      });
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

      expect(listSpy).not.toHaveBeenCalled();
      expect(deleteSpy).not.toHaveBeenCalled();
    });
  });

  describe("handlePostChange with oldSeriesName", () => {
    it("should cleanup old series when post moves to new series", async () => {
      const post = createMockPost("1", "Post 1", "post-1", "published", {
        seriesName: "New Series",
        seriesIndex: 1,
      });

      const getEntitySpy = spyOn(mockEntityService, "getEntity");
      getEntitySpy
        .mockResolvedValueOnce(null) // New Series doesn't exist
        .mockResolvedValueOnce({
          id: "old-series",
          entityType: "series",
          content: "",
          contentHash: "",
          created: "",
          updated: "",
          metadata: { title: "Old Series", slug: "old-series" },
        });

      spyOn(mockEntityService, "listEntities").mockResolvedValue([]);

      const upsertSpy = stubUpsert();
      const deleteSpy = spyOn(
        mockEntityService,
        "deleteEntity",
      ).mockResolvedValue(true);

      await manager.handlePostChange(post, "Old Series");

      expect(upsertSpy).toHaveBeenCalled();
      expect(deleteSpy).toHaveBeenCalledWith("series", "old-series");
    });

    it("should not cleanup if old and new series are the same", async () => {
      const post = createMockPost("1", "Post 1", "post-1", "published", {
        seriesName: "Same Series",
        seriesIndex: 1,
      });

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
