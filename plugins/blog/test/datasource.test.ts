import { describe, it, expect, beforeEach, spyOn, type Mock } from "bun:test";
import { BlogDataSource } from "../src/datasources/blog-datasource";
import type { IEntityService, BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import { createMockLogger, createMockEntityService } from "@brains/test-utils";
import { createMockPost } from "./fixtures/blog-entities";

const singlePostSchema = z.object({
  post: z.any(),
  prevPost: z.any().nullable(),
  nextPost: z.any().nullable(),
  seriesPosts: z.any().nullable(),
});

const postListSchema = z.object({
  posts: z.array(z.any()),
});

const paginationSchema = z.object({
  currentPage: z.number(),
  totalPages: z.number(),
  totalItems: z.number(),
  pageSize: z.number(),
  hasNextPage: z.boolean(),
  hasPrevPage: z.boolean(),
});

const paginatedListSchema = z.object({
  posts: z.array(
    z
      .object({
        id: z.string(),
        entityType: z.string(),
        frontmatter: z
          .object({
            title: z.string(),
            slug: z.string(),
            status: z.string(),
          })
          .passthrough(),
        body: z.string(),
      })
      .passthrough(),
  ),
  pagination: paginationSchema.nullable(),
});

describe("BlogDataSource", () => {
  let datasource: BlogDataSource;
  let mockEntityService: IEntityService;
  let mockLogger: Logger;
  let mockContext: BaseDataSourceContext;
  let listEntitiesSpy: Mock<(...args: unknown[]) => Promise<unknown>>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockEntityService = createMockEntityService();
    mockContext = { entityService: mockEntityService };

    listEntitiesSpy = spyOn(
      mockEntityService,
      "listEntities",
    ) as unknown as typeof listEntitiesSpy;

    datasource = new BlogDataSource(mockLogger);
  });

  describe("fetchLatestPost", () => {
    it("should fetch the most recent published post", async () => {
      const latestPost = createMockPost(
        "post-2",
        "Latest Post",
        "latest-post",
        "published",
        { publishedAt: "2025-01-03T10:00:00.000Z" },
      );
      listEntitiesSpy.mockResolvedValue([latestPost]);

      const result = await datasource.fetch(
        { entityType: "post", query: { latest: true } },
        singlePostSchema,
        mockContext,
      );

      expect(result.post.id).toBe("post-2");
      expect(result.post.frontmatter.title).toBe("Latest Post");
      expect(result.prevPost).toBeNull();
      expect(result.nextPost).toBeNull();
      expect(result.seriesPosts).toBeNull();
    });

    it("should exclude draft posts when fetching latest", async () => {
      const latestPublished = createMockPost(
        "post-3",
        "Another Published",
        "another-published",
        "published",
        { publishedAt: "2025-01-02T10:00:00.000Z" },
      );
      listEntitiesSpy.mockResolvedValue([latestPublished]);

      const result = await datasource.fetch(
        { entityType: "post", query: { latest: true } },
        singlePostSchema,
        mockContext,
      );

      expect(result.post.id).toBe("post-3");
      expect(result.post.frontmatter.status).toBe("published");
    });

    it("should throw error when no published posts exist", async () => {
      listEntitiesSpy.mockResolvedValue([]);

      expect(
        datasource.fetch(
          { entityType: "post", query: { latest: true } },
          singlePostSchema,
          mockContext,
        ),
      ).rejects.toThrow("NO_PUBLISHED_POSTS");
    });

    it("should include series posts if latest post is part of a series", async () => {
      const latestPost = createMockPost(
        "post-3",
        "Latest Post",
        "latest-post",
        "published",
        {
          publishedAt: "2025-01-03T10:00:00.000Z",
          seriesName: "My Series",
          seriesIndex: 3,
        },
      );

      const seriesPosts = [
        createMockPost(
          "post-1",
          "Series Part 1",
          "series-part-1",
          "published",
          {
            publishedAt: "2025-01-01T10:00:00.000Z",
            seriesName: "My Series",
            seriesIndex: 1,
          },
        ),
        createMockPost(
          "post-2",
          "Series Part 2",
          "series-part-2",
          "published",
          {
            publishedAt: "2025-01-02T10:00:00.000Z",
            seriesName: "My Series",
            seriesIndex: 2,
          },
        ),
        latestPost,
      ];

      listEntitiesSpy
        .mockResolvedValueOnce([latestPost])
        .mockResolvedValueOnce(seriesPosts);

      const result = await datasource.fetch(
        { entityType: "post", query: { latest: true } },
        singlePostSchema,
        mockContext,
      );

      expect(result.post.id).toBe("post-3");
      expect(result.seriesPosts).toHaveLength(3);
      expect(result.seriesPosts[0].id).toBe("post-1");
      expect(result.seriesPosts[2].id).toBe("post-3");
    });
  });

  describe("fetchSinglePost", () => {
    it("should fetch a single post by ID with navigation", async () => {
      const targetPost = createMockPost(
        "post-2",
        "Middle Post",
        "middle-post",
        "published",
        { publishedAt: "2025-01-02T10:00:00.000Z" },
      );

      const allPostsSorted = [
        createMockPost("post-3", "Newer Post", "newer-post", "published", {
          publishedAt: "2025-01-03T10:00:00.000Z",
        }),
        targetPost,
        createMockPost("post-1", "Older Post", "older-post", "published", {
          publishedAt: "2025-01-01T10:00:00.000Z",
        }),
      ];

      listEntitiesSpy
        .mockResolvedValueOnce([targetPost])
        .mockResolvedValueOnce(allPostsSorted);

      const result = await datasource.fetch(
        { entityType: "post", query: { id: "middle-post" } },
        singlePostSchema,
        mockContext,
      );

      expect(result.post.id).toBe("post-2");
      expect(result.prevPost?.id).toBe("post-3");
      expect(result.nextPost?.id).toBe("post-1");
      expect(result.seriesPosts).toBeNull();
    });

    it("should throw error when post not found", async () => {
      listEntitiesSpy.mockResolvedValue([]);

      expect(
        datasource.fetch(
          { entityType: "post", query: { id: "nonexistent-slug" } },
          singlePostSchema,
          mockContext,
        ),
      ).rejects.toThrow("Blog post not found with slug: nonexistent-slug");
    });

    it("should include series posts when post is part of a series", async () => {
      const targetPost = createMockPost(
        "post-2",
        "Series Part 2",
        "series-part-2",
        "published",
        {
          publishedAt: "2025-01-02T10:00:00.000Z",
          seriesName: "My Series",
          seriesIndex: 2,
        },
      );

      const allPostsSorted = [
        createMockPost("post-4", "Other Post", "other-post", "published", {
          publishedAt: "2025-01-04T10:00:00.000Z",
        }),
        createMockPost(
          "post-3",
          "Series Part 3",
          "series-part-3",
          "published",
          {
            publishedAt: "2025-01-03T10:00:00.000Z",
            seriesName: "My Series",
            seriesIndex: 3,
          },
        ),
        targetPost,
        createMockPost(
          "post-1",
          "Series Part 1",
          "series-part-1",
          "published",
          {
            publishedAt: "2025-01-01T10:00:00.000Z",
            seriesName: "My Series",
            seriesIndex: 1,
          },
        ),
      ];

      const seriesPosts = [
        createMockPost(
          "post-1",
          "Series Part 1",
          "series-part-1",
          "published",
          {
            publishedAt: "2025-01-01T10:00:00.000Z",
            seriesName: "My Series",
            seriesIndex: 1,
          },
        ),
        targetPost,
        createMockPost(
          "post-3",
          "Series Part 3",
          "series-part-3",
          "published",
          {
            publishedAt: "2025-01-03T10:00:00.000Z",
            seriesName: "My Series",
            seriesIndex: 3,
          },
        ),
      ];

      listEntitiesSpy
        .mockResolvedValueOnce([targetPost])
        .mockResolvedValueOnce(allPostsSorted)
        .mockResolvedValueOnce(seriesPosts);

      const result = await datasource.fetch(
        { entityType: "post", query: { id: "series-part-2" } },
        singlePostSchema,
        mockContext,
      );

      expect(result.seriesPosts).toHaveLength(3);
      expect(result.seriesPosts[0].id).toBe("post-1");
      expect(result.seriesPosts[1].id).toBe("post-2");
      expect(result.seriesPosts[2].id).toBe("post-3");
    });

    it("should handle first post (no prev)", async () => {
      const targetPost = createMockPost(
        "post-1",
        "First Post",
        "first-post",
        "published",
        { publishedAt: "2025-01-03T10:00:00.000Z" },
      );

      const allPostsSorted = [
        targetPost,
        createMockPost("post-2", "Older Post", "older-post", "published", {
          publishedAt: "2025-01-01T10:00:00.000Z",
        }),
      ];

      listEntitiesSpy
        .mockResolvedValueOnce([targetPost])
        .mockResolvedValueOnce(allPostsSorted);

      const result = await datasource.fetch(
        { entityType: "post", query: { id: "first-post" } },
        singlePostSchema,
        mockContext,
      );

      expect(result.post.id).toBe("post-1");
      expect(result.prevPost).toBeNull();
      expect(result.nextPost?.id).toBe("post-2");
    });

    it("should handle last post (no next)", async () => {
      const targetPost = createMockPost(
        "post-2",
        "Oldest Post",
        "oldest-post",
        "published",
        { publishedAt: "2025-01-01T10:00:00.000Z" },
      );

      const allPostsSorted = [
        createMockPost("post-1", "Newer Post", "newer-post", "published", {
          publishedAt: "2025-01-03T10:00:00.000Z",
        }),
        targetPost,
      ];

      listEntitiesSpy
        .mockResolvedValueOnce([targetPost])
        .mockResolvedValueOnce(allPostsSorted);

      const result = await datasource.fetch(
        { entityType: "post", query: { id: "oldest-post" } },
        singlePostSchema,
        mockContext,
      );

      expect(result.post.id).toBe("post-2");
      expect(result.prevPost?.id).toBe("post-1");
      expect(result.nextPost).toBeNull();
    });
  });

  describe("fetchPostList", () => {
    it("should fetch and sort all posts by publishedAt", async () => {
      const postsSorted = [
        createMockPost("post-2", "Newest", "newest", "published", {
          publishedAt: "2025-01-03T10:00:00.000Z",
        }),
        createMockPost("post-3", "Middle", "middle", "published", {
          publishedAt: "2025-01-02T10:00:00.000Z",
        }),
        createMockPost("post-1", "Oldest", "oldest", "published", {
          publishedAt: "2025-01-01T10:00:00.000Z",
        }),
      ];

      listEntitiesSpy.mockResolvedValue(postsSorted);

      const result = await datasource.fetch(
        { entityType: "post" },
        postListSchema,
        mockContext,
      );

      expect(result.posts).toHaveLength(3);
      expect(result.posts[0].id).toBe("post-2");
      expect(result.posts[1].id).toBe("post-3");
      expect(result.posts[2].id).toBe("post-1");
    });

    it("should return posts in database-sorted order (publishedAt desc)", async () => {
      const postsSorted = [
        createMockPost("post-2", "Published", "published", "published", {
          publishedAt: "2025-01-01T10:00:00.000Z",
        }),
        createMockPost("post-1", "Draft 1", "draft-1", "draft"),
        createMockPost("post-3", "Draft 2", "draft-2", "draft"),
      ];

      listEntitiesSpy.mockResolvedValue(postsSorted);

      const result = await datasource.fetch(
        { entityType: "post" },
        postListSchema,
        { ...mockContext, publishedOnly: false },
      );

      expect(result.posts).toHaveLength(3);
      expect(result.posts[0].frontmatter.status).toBe("published");
      expect(result.posts[1].frontmatter.status).toBe("draft");
      expect(result.posts[2].frontmatter.status).toBe("draft");
    });

    it("should respect limit parameter", async () => {
      const limitedPosts = [
        createMockPost("post-2", "Post 2", "post-2", "published", {
          publishedAt: "2025-01-02T10:00:00.000Z",
        }),
        createMockPost("post-1", "Post 1", "post-1", "published", {
          publishedAt: "2025-01-01T10:00:00.000Z",
        }),
      ];

      listEntitiesSpy.mockResolvedValue(limitedPosts);

      const result = await datasource.fetch(
        { entityType: "post", query: { limit: 2 } },
        paginatedListSchema,
        mockContext,
      );

      expect(mockEntityService.listEntities).toHaveBeenCalledWith("post", {
        limit: 2,
        offset: 0,
        sortFields: [{ field: "publishedAt", direction: "desc" }],
      });

      expect(result.posts).toHaveLength(2);
    });

    it("should handle empty post list", async () => {
      listEntitiesSpy.mockResolvedValue([]);

      const result = await datasource.fetch(
        { entityType: "post" },
        paginatedListSchema,
        mockContext,
      );

      expect(result.posts).toHaveLength(0);
    });

    it("should parse frontmatter for all posts", async () => {
      const posts = [
        createMockPost("post-1", "Test Post", "test-post", "published", {
          publishedAt: "2025-01-01T10:00:00.000Z",
        }),
      ];

      listEntitiesSpy.mockResolvedValue(posts);

      const result = await datasource.fetch(
        { entityType: "post" },
        postListSchema,
        mockContext,
      );

      expect(result.posts[0].frontmatter).toBeDefined();
      expect(result.posts[0].frontmatter.title).toBe("Test Post");
      expect(result.posts[0].frontmatter.author).toBe("Test Author");
      expect(result.posts[0].body).toBeDefined();
      expect(result.posts[0].body).toContain("# Test Post");
      expect(result.posts[0].body).not.toContain("---");
    });
  });

  describe("fetchSeriesPosts", () => {
    it("should fetch posts in a series ordered by index", async () => {
      const seriesPostsSorted = [
        createMockPost(
          "post-1",
          "Series Part 1",
          "series-part-1",
          "published",
          {
            publishedAt: "2025-01-01T10:00:00.000Z",
            seriesName: "My Series",
            seriesIndex: 1,
          },
        ),
        createMockPost(
          "post-2",
          "Series Part 2",
          "series-part-2",
          "published",
          {
            publishedAt: "2025-01-02T10:00:00.000Z",
            seriesName: "My Series",
            seriesIndex: 2,
          },
        ),
        createMockPost(
          "post-3",
          "Series Part 3",
          "series-part-3",
          "published",
          {
            publishedAt: "2025-01-03T10:00:00.000Z",
            seriesName: "My Series",
            seriesIndex: 3,
          },
        ),
      ];

      listEntitiesSpy.mockResolvedValue(seriesPostsSorted);

      const schema = z.object({
        seriesName: z.string(),
        posts: z.array(z.any()),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { "metadata.seriesName": "My Series" } },
        schema,
        mockContext,
      );

      expect(result.seriesName).toBe("My Series");
      expect(result.posts).toHaveLength(3);
      expect(result.posts[0].id).toBe("post-1");
      expect(result.posts[1].id).toBe("post-2");
      expect(result.posts[2].id).toBe("post-3");
    });

    it("should include draft posts in series", async () => {
      const seriesPostsSorted = [
        createMockPost(
          "post-1",
          "Series Part 1",
          "series-part-1",
          "published",
          {
            publishedAt: "2025-01-01T10:00:00.000Z",
            seriesName: "My Series",
            seriesIndex: 1,
          },
        ),
        createMockPost("post-2", "Series Part 2", "series-part-2", "draft", {
          seriesName: "My Series",
          seriesIndex: 2,
        }),
      ];

      listEntitiesSpy.mockResolvedValue(seriesPostsSorted);

      const schema = z.object({
        seriesName: z.string(),
        posts: z.array(z.any()),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { "metadata.seriesName": "My Series" } },
        schema,
        mockContext,
      );

      expect(result.posts).toHaveLength(2);
      expect(result.posts[1].frontmatter.status).toBe("draft");
    });

    it("should handle series with no posts", async () => {
      listEntitiesSpy.mockResolvedValue([]);

      const schema = z.object({
        seriesName: z.string(),
        posts: z.array(z.any()),
      });

      const result = await datasource.fetch(
        {
          entityType: "post",
          query: { "metadata.seriesName": "Empty Series" },
        },
        schema,
        mockContext,
      );

      expect(result.seriesName).toBe("Empty Series");
      expect(result.posts).toHaveLength(0);
    });

    it("should handle series posts without explicit index", async () => {
      const posts = [
        createMockPost(
          "post-1",
          "Series Part 1",
          "series-part-1",
          "published",
          {
            publishedAt: "2025-01-01T10:00:00.000Z",
            seriesName: "My Series",
          },
        ),
        createMockPost(
          "post-2",
          "Series Part 2",
          "series-part-2",
          "published",
          {
            publishedAt: "2025-01-02T10:00:00.000Z",
            seriesName: "My Series",
          },
        ),
      ];

      listEntitiesSpy.mockResolvedValue(posts);

      const schema = z.object({
        seriesName: z.string(),
        posts: z.array(z.any()),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { "metadata.seriesName": "My Series" } },
        schema,
        mockContext,
      );

      expect(result.posts).toHaveLength(2);
    });
  });

  describe("pagination", () => {
    it("should return paginated posts when page is specified", async () => {
      const page1Posts = Array.from({ length: 3 }, (_, i) =>
        createMockPost(
          `post-${i + 1}`,
          `Post ${i + 1}`,
          `post-${i + 1}`,
          "published",
          {
            publishedAt: `2025-01-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
          },
        ),
      );

      listEntitiesSpy.mockResolvedValue(page1Posts);
      spyOn(mockEntityService, "countEntities").mockResolvedValue(10);

      const result = await datasource.fetch(
        { entityType: "post", query: { page: 1, pageSize: 3 } },
        paginatedListSchema,
        mockContext,
      );

      expect(result.posts).toHaveLength(3);
      expect(result.pagination).not.toBeNull();
      expect(result.pagination?.currentPage).toBe(1);
      expect(result.pagination?.totalPages).toBe(4);
      expect(result.pagination?.totalItems).toBe(10);
      expect(result.pagination?.pageSize).toBe(3);
      expect(result.pagination?.hasNextPage).toBe(true);
      expect(result.pagination?.hasPrevPage).toBe(false);
    });

    it("should return correct posts for page 2", async () => {
      const page2Posts = Array.from({ length: 3 }, (_, i) =>
        createMockPost(
          `post-${i + 4}`,
          `Post ${i + 4}`,
          `post-${i + 4}`,
          "published",
          {
            publishedAt: `2025-01-${String(7 - i).padStart(2, "0")}T10:00:00.000Z`,
          },
        ),
      );

      listEntitiesSpy.mockResolvedValue(page2Posts);
      spyOn(mockEntityService, "countEntities").mockResolvedValue(10);

      const result = await datasource.fetch(
        { entityType: "post", query: { page: 2, pageSize: 3 } },
        paginatedListSchema,
        mockContext,
      );

      expect(mockEntityService.listEntities).toHaveBeenCalledWith("post", {
        limit: 3,
        offset: 3,
        sortFields: [{ field: "publishedAt", direction: "desc" }],
      });

      expect(result.posts).toHaveLength(3);
      expect(result.pagination?.currentPage).toBe(2);
      expect(result.pagination?.hasNextPage).toBe(true);
      expect(result.pagination?.hasPrevPage).toBe(true);
    });

    it("should return correct posts for last page", async () => {
      const lastPagePosts = [
        createMockPost("post-10", "Post 10", "post-10", "published", {
          publishedAt: "2025-01-01T10:00:00.000Z",
        }),
      ];

      listEntitiesSpy.mockResolvedValue(lastPagePosts);
      spyOn(mockEntityService, "countEntities").mockResolvedValue(10);

      const result = await datasource.fetch(
        { entityType: "post", query: { page: 4, pageSize: 3 } },
        paginatedListSchema,
        mockContext,
      );

      expect(mockEntityService.listEntities).toHaveBeenCalledWith("post", {
        limit: 3,
        offset: 9,
        sortFields: [{ field: "publishedAt", direction: "desc" }],
      });

      expect(result.posts).toHaveLength(1);
      expect(result.pagination?.currentPage).toBe(4);
      expect(result.pagination?.hasNextPage).toBe(false);
      expect(result.pagination?.hasPrevPage).toBe(true);
    });

    it("should return null pagination when page is not specified", async () => {
      const posts = [
        createMockPost("post-1", "Post 1", "post-1", "published", {
          publishedAt: "2025-01-01T10:00:00.000Z",
        }),
      ];

      listEntitiesSpy.mockResolvedValue(posts);

      const result = await datasource.fetch(
        { entityType: "post" },
        paginatedListSchema,
        mockContext,
      );

      expect(result.pagination).toBeNull();
    });

    it("should handle empty results with pagination", async () => {
      listEntitiesSpy.mockResolvedValue([]);
      spyOn(mockEntityService, "countEntities").mockResolvedValue(0);

      const result = await datasource.fetch(
        { entityType: "post", query: { page: 1, pageSize: 10 } },
        paginatedListSchema,
        mockContext,
      );

      expect(result.posts).toHaveLength(0);
      expect(result.pagination?.currentPage).toBe(1);
      expect(result.pagination?.totalPages).toBe(1);
      expect(result.pagination?.totalItems).toBe(0);
      expect(result.pagination?.hasNextPage).toBe(false);
      expect(result.pagination?.hasPrevPage).toBe(false);
    });

    it("should paginate posts using scoped entityService", async () => {
      const page1Posts = [
        createMockPost("post-1", "Published 1", "published-1", "published", {
          publishedAt: "2025-01-01T10:00:00.000Z",
        }),
        createMockPost("post-3", "Published 2", "published-2", "published", {
          publishedAt: "2025-01-02T10:00:00.000Z",
        }),
      ];

      listEntitiesSpy.mockResolvedValue(page1Posts);
      spyOn(mockEntityService, "countEntities").mockResolvedValue(3);

      const result = await datasource.fetch(
        { entityType: "post", query: { page: 1, pageSize: 2 } },
        paginatedListSchema,
        mockContext,
      );

      expect(mockEntityService.listEntities).toHaveBeenCalledWith("post", {
        limit: 2,
        offset: 0,
        sortFields: [{ field: "publishedAt", direction: "desc" }],
      });

      expect(mockEntityService.countEntities).toHaveBeenCalledWith("post");

      expect(result.pagination?.totalItems).toBe(3);
      expect(result.pagination?.totalPages).toBe(2);
      expect(result.posts).toHaveLength(2);
    });
  });

  describe("metadata", () => {
    it("should have correct datasource ID", () => {
      expect(datasource.id).toBe("blog:entities");
    });

    it("should have descriptive name and description", () => {
      expect(datasource.name).toBe("Blog Entity DataSource");
      expect(datasource.description).toContain("blog post entities");
    });
  });
});
