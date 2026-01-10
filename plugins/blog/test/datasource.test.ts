import { describe, it, expect, beforeEach, spyOn, type Mock } from "bun:test";
import { BlogDataSource } from "../src/datasources/blog-datasource";
import type { BlogPost } from "../src/schemas/blog-post";
import type { IEntityService, BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z, computeContentHash } from "@brains/utils";
import { createMockLogger, createMockEntityService } from "@brains/test-utils";

describe("BlogDataSource", () => {
  let datasource: BlogDataSource;
  let mockEntityService: IEntityService;
  let mockLogger: Logger;
  let mockContext: BaseDataSourceContext;
  let listEntitiesSpy: Mock<(...args: unknown[]) => Promise<unknown>>;

  // Sample test data
  const createMockPost = (
    id: string,
    title: string,
    slug: string,
    status: "draft" | "published",
    publishedAt?: string,
    seriesName?: string,
    seriesIndex?: number,
  ): BlogPost => {
    const content = `---
title: ${title}
slug: ${slug}
status: ${status}
${publishedAt ? `publishedAt: "${publishedAt}"` : ""}
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
        status,
        publishedAt,
        seriesName,
        seriesIndex,
      },
    };
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockEntityService = createMockEntityService();
    mockContext = {};

    // Set up spy for mock method
    listEntitiesSpy = spyOn(
      mockEntityService,
      "listEntities",
    ) as unknown as typeof listEntitiesSpy;

    datasource = new BlogDataSource(mockEntityService, mockLogger);
  });

  describe("fetchLatestPost", () => {
    it("should fetch the most recent published post", async () => {
      // Mock returns only the first post (limit: 1, already sorted by DB)
      const latestPost: BlogPost[] = [
        createMockPost(
          "post-2",
          "Latest Post",
          "latest-post",
          "published",
          "2025-01-03T10:00:00.000Z",
        ),
      ];

      listEntitiesSpy.mockResolvedValue(latestPost);

      const schema = z.object({
        post: z.any(),
        prevPost: z.any().nullable(),
        nextPost: z.any().nullable(),
        seriesPosts: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { latest: true } },
        schema,
        mockContext,
      );

      expect(result.post.id).toBe("post-2");
      expect(result.post.frontmatter.title).toBe("Latest Post");
      expect(result.prevPost).toBeNull();
      expect(result.nextPost).toBeNull();
      expect(result.seriesPosts).toBeNull();
    });

    it("should exclude draft posts when fetching latest", async () => {
      // Mock returns only the latest published post (publishedOnly: true, limit: 1)
      const latestPublished: BlogPost[] = [
        createMockPost(
          "post-3",
          "Another Published",
          "another-published",
          "published",
          "2025-01-02T10:00:00.000Z",
        ),
      ];

      listEntitiesSpy.mockResolvedValue(latestPublished);

      const schema = z.object({
        post: z.any(),
        prevPost: z.any().nullable(),
        nextPost: z.any().nullable(),
        seriesPosts: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { latest: true } },
        schema,
        mockContext,
      );

      expect(result.post.id).toBe("post-3");
      expect(result.post.frontmatter.status).toBe("published");
    });

    it("should throw error when no published posts exist", async () => {
      // publishedOnly: true returns empty when no published posts
      listEntitiesSpy.mockResolvedValue([]);

      const schema = z.object({
        post: z.any(),
        prevPost: z.any().nullable(),
        nextPost: z.any().nullable(),
        seriesPosts: z.any().nullable(),
      });

      expect(
        datasource.fetch(
          { entityType: "post", query: { latest: true } },
          schema,
          mockContext,
        ),
      ).rejects.toThrow("NO_PUBLISHED_POSTS");
    });

    it("should include series posts if latest post is part of a series", async () => {
      // First call: fetch latest post (limit: 1)
      const latestPost: BlogPost[] = [
        createMockPost(
          "post-3",
          "Latest Post",
          "latest-post",
          "published",
          "2025-01-03T10:00:00.000Z",
          "My Series",
          3,
        ),
      ];

      // Second call: fetch series posts (sorted by seriesIndex)
      const seriesPosts: BlogPost[] = [
        createMockPost(
          "post-1",
          "Series Part 1",
          "series-part-1",
          "published",
          "2025-01-01T10:00:00.000Z",
          "My Series",
          1,
        ),
        createMockPost(
          "post-2",
          "Series Part 2",
          "series-part-2",
          "published",
          "2025-01-02T10:00:00.000Z",
          "My Series",
          2,
        ),
        createMockPost(
          "post-3",
          "Latest Post",
          "latest-post",
          "published",
          "2025-01-03T10:00:00.000Z",
          "My Series",
          3,
        ),
      ];

      listEntitiesSpy
        .mockResolvedValueOnce(latestPost)
        .mockResolvedValueOnce(seriesPosts);

      const schema = z.object({
        post: z.any(),
        prevPost: z.any().nullable(),
        nextPost: z.any().nullable(),
        seriesPosts: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { latest: true } },
        schema,
        mockContext,
      );

      expect(result.post.id).toBe("post-3");
      expect(result.seriesPosts).toBeDefined();
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
        "2025-01-02T10:00:00.000Z",
      );

      // DB returns sorted by publishedAt desc: newest first
      const allPostsSorted: BlogPost[] = [
        createMockPost(
          "post-3",
          "Newer Post",
          "newer-post",
          "published",
          "2025-01-03T10:00:00.000Z",
        ),
        targetPost,
        createMockPost(
          "post-1",
          "Older Post",
          "older-post",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
      ];

      // First call: fetch by slug, Second call: fetch all for navigation (already sorted)
      listEntitiesSpy
        .mockResolvedValueOnce([targetPost])
        .mockResolvedValueOnce(allPostsSorted);

      const schema = z.object({
        post: z.any(),
        prevPost: z.any().nullable(),
        nextPost: z.any().nullable(),
        seriesPosts: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { id: "middle-post" } },
        schema,
        mockContext,
      );

      expect(result.post.id).toBe("post-2");
      expect(result.prevPost?.id).toBe("post-3"); // Newer post (prev in sorted list)
      expect(result.nextPost?.id).toBe("post-1"); // Older post (next in sorted list)
      expect(result.seriesPosts).toBeNull();
    });

    it("should throw error when post not found", async () => {
      listEntitiesSpy.mockResolvedValue([]);

      const schema = z.object({
        post: z.any(),
        prevPost: z.any().nullable(),
        nextPost: z.any().nullable(),
        seriesPosts: z.any().nullable(),
      });

      expect(
        datasource.fetch(
          { entityType: "post", query: { id: "nonexistent-slug" } },
          schema,
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
        "2025-01-02T10:00:00.000Z",
        "My Series",
        2,
      );

      // All posts sorted by publishedAt desc for navigation
      const allPostsSorted: BlogPost[] = [
        createMockPost(
          "post-4",
          "Other Post",
          "other-post",
          "published",
          "2025-01-04T10:00:00.000Z",
        ),
        createMockPost(
          "post-3",
          "Series Part 3",
          "series-part-3",
          "published",
          "2025-01-03T10:00:00.000Z",
          "My Series",
          3,
        ),
        targetPost,
        createMockPost(
          "post-1",
          "Series Part 1",
          "series-part-1",
          "published",
          "2025-01-01T10:00:00.000Z",
          "My Series",
          1,
        ),
      ];

      // Series posts sorted by seriesIndex asc
      const seriesPosts: BlogPost[] = [
        createMockPost(
          "post-1",
          "Series Part 1",
          "series-part-1",
          "published",
          "2025-01-01T10:00:00.000Z",
          "My Series",
          1,
        ),
        targetPost,
        createMockPost(
          "post-3",
          "Series Part 3",
          "series-part-3",
          "published",
          "2025-01-03T10:00:00.000Z",
          "My Series",
          3,
        ),
      ];

      // First call: fetch by slug, Second call: fetch all for navigation, Third call: fetch series
      listEntitiesSpy
        .mockResolvedValueOnce([targetPost])
        .mockResolvedValueOnce(allPostsSorted)
        .mockResolvedValueOnce(seriesPosts);

      const schema = z.object({
        post: z.any(),
        prevPost: z.any().nullable(),
        nextPost: z.any().nullable(),
        seriesPosts: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { id: "series-part-2" } },
        schema,
        mockContext,
      );

      expect(result.seriesPosts).toBeDefined();
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
        "2025-01-03T10:00:00.000Z",
      );

      // Sorted by publishedAt desc: targetPost is first (newest)
      const allPostsSorted: BlogPost[] = [
        targetPost,
        createMockPost(
          "post-2",
          "Older Post",
          "older-post",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
      ];

      // First call: fetch by slug, Second call: fetch all for navigation
      listEntitiesSpy
        .mockResolvedValueOnce([targetPost])
        .mockResolvedValueOnce(allPostsSorted);

      const schema = z.object({
        post: z.any(),
        prevPost: z.any().nullable(),
        nextPost: z.any().nullable(),
        seriesPosts: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { id: "first-post" } },
        schema,
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
        "2025-01-01T10:00:00.000Z",
      );

      // Sorted by publishedAt desc: targetPost is last (oldest)
      const allPostsSorted: BlogPost[] = [
        createMockPost(
          "post-1",
          "Newer Post",
          "newer-post",
          "published",
          "2025-01-03T10:00:00.000Z",
        ),
        targetPost,
      ];

      // First call: fetch by slug, Second call: fetch all for navigation
      listEntitiesSpy
        .mockResolvedValueOnce([targetPost])
        .mockResolvedValueOnce(allPostsSorted);

      const schema = z.object({
        post: z.any(),
        prevPost: z.any().nullable(),
        nextPost: z.any().nullable(),
        seriesPosts: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { id: "oldest-post" } },
        schema,
        mockContext,
      );

      expect(result.post.id).toBe("post-2");
      expect(result.prevPost?.id).toBe("post-1");
      expect(result.nextPost).toBeNull();
    });
  });

  describe("fetchPostList", () => {
    it("should fetch and sort all posts by publishedAt", async () => {
      // DB returns posts already sorted by publishedAt desc
      const postsSorted: BlogPost[] = [
        createMockPost(
          "post-2",
          "Newest",
          "newest",
          "published",
          "2025-01-03T10:00:00.000Z",
        ),
        createMockPost(
          "post-3",
          "Middle",
          "middle",
          "published",
          "2025-01-02T10:00:00.000Z",
        ),
        createMockPost(
          "post-1",
          "Oldest",
          "oldest",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
      ];

      listEntitiesSpy.mockResolvedValue(postsSorted);

      const schema = z.object({
        posts: z.array(z.any()),
      });

      const result = await datasource.fetch(
        { entityType: "post" },
        schema,
        mockContext,
      );

      expect(result.posts).toHaveLength(3);
      expect(result.posts[0].id).toBe("post-2"); // Newest first
      expect(result.posts[1].id).toBe("post-3");
      expect(result.posts[2].id).toBe("post-1"); // Oldest last
    });

    it("should return posts in database-sorted order (publishedAt desc)", async () => {
      // DB sorts by publishedAt desc - drafts without publishedAt come after published posts
      const postsSorted: BlogPost[] = [
        createMockPost(
          "post-2",
          "Published",
          "published",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockPost("post-1", "Draft 1", "draft-1", "draft"),
        createMockPost("post-3", "Draft 2", "draft-2", "draft"),
      ];

      listEntitiesSpy.mockResolvedValue(postsSorted);

      const schema = z.object({
        posts: z.array(z.any()),
      });

      const result = await datasource.fetch(
        { entityType: "post" },
        schema,
        { ...mockContext, publishedOnly: false }, // Show all posts (drafts included)
      );

      expect(result.posts).toHaveLength(3);
      expect(result.posts[0].frontmatter.status).toBe("published");
      expect(result.posts[1].frontmatter.status).toBe("draft");
      expect(result.posts[2].frontmatter.status).toBe("draft");
    });

    it("should respect limit parameter", async () => {
      // With database-level limit, only 2 posts are returned
      const limitedPosts: BlogPost[] = [
        createMockPost(
          "post-2",
          "Post 2",
          "post-2",
          "published",
          "2025-01-02T10:00:00.000Z",
        ),
        createMockPost(
          "post-1",
          "Post 1",
          "post-1",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
      ];

      listEntitiesSpy.mockResolvedValue(limitedPosts);

      const schema = z.object({
        posts: z.array(
          z
            .object({
              id: z.string(),
              frontmatter: z.object({ title: z.string() }).passthrough(),
            })
            .passthrough(),
        ),
        pagination: z.null(),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { limit: 2 } },
        schema,
        mockContext,
      );

      // Verify limit was passed to database
      expect(mockEntityService.listEntities).toHaveBeenCalledWith("post", {
        limit: 2,
        offset: 0,
        sortFields: [{ field: "publishedAt", direction: "desc" }],
      });

      expect(result.posts).toHaveLength(2);
    });

    it("should handle empty post list", async () => {
      listEntitiesSpy.mockResolvedValue([]);

      const schema = z.object({
        posts: z.array(
          z
            .object({
              id: z.string(),
              frontmatter: z.object({ title: z.string() }).passthrough(),
            })
            .passthrough(),
        ),
        pagination: z.null(),
      });

      const result = await datasource.fetch(
        { entityType: "post" },
        schema,
        mockContext,
      );

      expect(result.posts).toHaveLength(0);
    });

    it("should parse frontmatter for all posts", async () => {
      const posts: BlogPost[] = [
        createMockPost(
          "post-1",
          "Test Post",
          "test-post",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
      ];

      listEntitiesSpy.mockResolvedValue(posts);

      const schema = z.object({
        posts: z.array(z.any()),
      });

      const result = await datasource.fetch(
        { entityType: "post" },
        schema,
        mockContext,
      );

      expect(result.posts[0].frontmatter).toBeDefined();
      expect(result.posts[0].frontmatter.title).toBe("Test Post");
      expect(result.posts[0].frontmatter.author).toBe("Test Author");
      expect(result.posts[0].body).toBeDefined();
      expect(result.posts[0].body).toContain("# Test Post");
      expect(result.posts[0].body).not.toContain("---"); // No frontmatter in body
    });
  });

  describe("fetchSeriesPosts", () => {
    it("should fetch posts in a series ordered by index", async () => {
      // DB returns series posts sorted by seriesIndex asc
      const seriesPostsSorted: BlogPost[] = [
        createMockPost(
          "post-1",
          "Series Part 1",
          "series-part-1",
          "published",
          "2025-01-01T10:00:00.000Z",
          "My Series",
          1,
        ),
        createMockPost(
          "post-2",
          "Series Part 2",
          "series-part-2",
          "published",
          "2025-01-02T10:00:00.000Z",
          "My Series",
          2,
        ),
        createMockPost(
          "post-3",
          "Series Part 3",
          "series-part-3",
          "published",
          "2025-01-03T10:00:00.000Z",
          "My Series",
          3,
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
      // DB returns series posts sorted by seriesIndex asc
      const seriesPostsSorted: BlogPost[] = [
        createMockPost(
          "post-1",
          "Series Part 1",
          "series-part-1",
          "published",
          "2025-01-01T10:00:00.000Z",
          "My Series",
          1,
        ),
        createMockPost(
          "post-2",
          "Series Part 2",
          "series-part-2",
          "draft",
          undefined,
          "My Series",
          2,
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
      const posts: BlogPost[] = [
        createMockPost(
          "post-1",
          "Series Part 1",
          "series-part-1",
          "published",
          "2025-01-01T10:00:00.000Z",
          "My Series",
        ),
        createMockPost(
          "post-2",
          "Series Part 2",
          "series-part-2",
          "published",
          "2025-01-02T10:00:00.000Z",
          "My Series",
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
      // Should still work, treating undefined as 0
    });
  });

  describe("pagination", () => {
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

    it("should return paginated posts when page is specified", async () => {
      // With database-level pagination, only current page's posts are returned
      const page1Posts: BlogPost[] = Array.from({ length: 3 }, (_, i) =>
        createMockPost(
          `post-${i + 1}`,
          `Post ${i + 1}`,
          `post-${i + 1}`,
          "published",
          `2025-01-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
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
      expect(result.pagination?.totalPages).toBe(4); // 10 posts / 3 per page = 4 pages
      expect(result.pagination?.totalItems).toBe(10);
      expect(result.pagination?.pageSize).toBe(3);
      expect(result.pagination?.hasNextPage).toBe(true);
      expect(result.pagination?.hasPrevPage).toBe(false);
    });

    it("should return correct posts for page 2", async () => {
      // With database-level pagination, only page 2's posts are returned
      const page2Posts: BlogPost[] = Array.from({ length: 3 }, (_, i) =>
        createMockPost(
          `post-${i + 4}`, // Posts 4, 5, 6 (page 2 with pageSize 3)
          `Post ${i + 4}`,
          `post-${i + 4}`,
          "published",
          `2025-01-${String(7 - i).padStart(2, "0")}T10:00:00.000Z`,
        ),
      );

      listEntitiesSpy.mockResolvedValue(page2Posts);
      spyOn(mockEntityService, "countEntities").mockResolvedValue(10);

      const result = await datasource.fetch(
        { entityType: "post", query: { page: 2, pageSize: 3 } },
        paginatedListSchema,
        mockContext,
      );

      // Verify correct offset was used
      expect(mockEntityService.listEntities).toHaveBeenCalledWith("post", {
        limit: 3,
        offset: 3, // (page 2 - 1) * 3
        sortFields: [{ field: "publishedAt", direction: "desc" }],
      });

      expect(result.posts).toHaveLength(3);
      expect(result.pagination?.currentPage).toBe(2);
      expect(result.pagination?.hasNextPage).toBe(true);
      expect(result.pagination?.hasPrevPage).toBe(true);
    });

    it("should return correct posts for last page", async () => {
      // With database-level pagination, only the last page's post is returned
      const lastPagePosts: BlogPost[] = [
        createMockPost(
          "post-10",
          "Post 10",
          "post-10",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
      ];

      listEntitiesSpy.mockResolvedValue(lastPagePosts);
      spyOn(mockEntityService, "countEntities").mockResolvedValue(10);

      const result = await datasource.fetch(
        { entityType: "post", query: { page: 4, pageSize: 3 } },
        paginatedListSchema,
        mockContext,
      );

      // Verify correct offset was used
      expect(mockEntityService.listEntities).toHaveBeenCalledWith("post", {
        limit: 3,
        offset: 9, // (page 4 - 1) * 3
        sortFields: [{ field: "publishedAt", direction: "desc" }],
      });

      expect(result.posts).toHaveLength(1); // Only 1 post on last page (10 % 3 = 1)
      expect(result.pagination?.currentPage).toBe(4);
      expect(result.pagination?.hasNextPage).toBe(false);
      expect(result.pagination?.hasPrevPage).toBe(true);
    });

    it("should return null pagination when page is not specified", async () => {
      const posts: BlogPost[] = [
        createMockPost(
          "post-1",
          "Post 1",
          "post-1",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
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
      expect(result.pagination?.totalPages).toBe(1); // buildPaginationInfo returns at least 1 page
      expect(result.pagination?.totalItems).toBe(0);
      expect(result.pagination?.hasNextPage).toBe(false);
      expect(result.pagination?.hasPrevPage).toBe(false);
    });

    it("should only paginate published posts when publishedOnly is true", async () => {
      // With database-level pagination, listEntities returns only current page
      const page1Posts: BlogPost[] = [
        createMockPost(
          "post-1",
          "Published 1",
          "published-1",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockPost(
          "post-3",
          "Published 2",
          "published-2",
          "published",
          "2025-01-02T10:00:00.000Z",
        ),
      ];

      listEntitiesSpy.mockResolvedValue(page1Posts);
      spyOn(mockEntityService, "countEntities").mockResolvedValue(3);

      const result = await datasource.fetch(
        { entityType: "post", query: { page: 1, pageSize: 2 } },
        paginatedListSchema,
        { ...mockContext, publishedOnly: true },
      );

      // Verify database-level pagination was used
      expect(mockEntityService.listEntities).toHaveBeenCalledWith("post", {
        limit: 2,
        offset: 0,
        sortFields: [{ field: "publishedAt", direction: "desc" }],
        publishedOnly: true,
      });

      // Verify countEntities was called for total
      expect(mockEntityService.countEntities).toHaveBeenCalledWith("post", {
        publishedOnly: true,
      });

      expect(result.pagination?.totalItems).toBe(3); // Total from countEntities
      expect(result.pagination?.totalPages).toBe(2); // 3 posts / 2 per page = 2 pages
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
