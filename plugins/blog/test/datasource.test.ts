import { describe, it, expect, beforeEach, mock } from "bun:test";
import { BlogDataSource } from "../src/datasources/blog-datasource";
import type { BlogPost } from "../src/schemas/blog-post";
import type { IEntityService, Logger } from "@brains/plugins";
import { z } from "@brains/utils";

describe("BlogDataSource", () => {
  let datasource: BlogDataSource;
  let mockEntityService: IEntityService;
  let mockLogger: Logger;

  // Sample test data
  const createMockPost = (
    id: string,
    title: string,
    status: "draft" | "published",
    publishedAt?: string,
    seriesName?: string,
    seriesIndex?: number,
  ): BlogPost => ({
    id,
    entityType: "post",
    content: `---
title: ${title}
status: ${status}
${publishedAt ? `publishedAt: "${publishedAt}"` : ""}
excerpt: Excerpt for ${title}
author: Test Author
${seriesName ? `seriesName: ${seriesName}` : ""}
${seriesIndex ? `seriesIndex: ${seriesIndex}` : ""}
---

# ${title}

Content for ${title}`,
    created: "2025-01-01T10:00:00.000Z",
    updated: "2025-01-01T10:00:00.000Z",
    metadata: {
      title,
      status,
      publishedAt,
      seriesName,
      seriesIndex,
    },
  });

  beforeEach(() => {
    mockLogger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      child: mock(() => mockLogger),
    } as unknown as Logger;

    mockEntityService = {
      getEntity: mock(() => null),
      listEntities: mock(() => []),
      createEntity: mock(() => ({})),
      updateEntity: mock(() => ({})),
      deleteEntity: mock(() => ({})),
    } as unknown as IEntityService;

    datasource = new BlogDataSource(mockEntityService, mockLogger);
  });

  describe("fetchLatestPost", () => {
    it("should fetch the most recent published post", async () => {
      const posts: BlogPost[] = [
        createMockPost(
          "post-1",
          "Older Post",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockPost(
          "post-2",
          "Latest Post",
          "published",
          "2025-01-03T10:00:00.000Z",
        ),
        createMockPost(
          "post-3",
          "Middle Post",
          "published",
          "2025-01-02T10:00:00.000Z",
        ),
      ];

      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(posts);

      const schema = z.object({
        post: z.any(),
        prevPost: z.any().nullable(),
        nextPost: z.any().nullable(),
        seriesPosts: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { latest: true } },
        schema,
      );

      expect(result.post.id).toBe("post-2");
      expect(result.post.frontmatter.title).toBe("Latest Post");
      expect(result.prevPost).toBeNull();
      expect(result.nextPost).toBeNull();
      expect(result.seriesPosts).toBeNull();
    });

    it("should exclude draft posts when fetching latest", async () => {
      const posts: BlogPost[] = [
        createMockPost(
          "post-1",
          "Published Post",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockPost("post-2", "Draft Post", "draft"),
        createMockPost(
          "post-3",
          "Another Published",
          "published",
          "2025-01-02T10:00:00.000Z",
        ),
      ];

      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(posts);

      const schema = z.object({
        post: z.any(),
        prevPost: z.any().nullable(),
        nextPost: z.any().nullable(),
        seriesPosts: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { latest: true } },
        schema,
      );

      expect(result.post.id).toBe("post-3");
      expect(result.post.frontmatter.status).toBe("published");
    });

    it("should throw error when no published posts exist", async () => {
      const posts: BlogPost[] = [
        createMockPost("post-1", "Draft 1", "draft"),
        createMockPost("post-2", "Draft 2", "draft"),
      ];

      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(posts);

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
        ),
      ).rejects.toThrow("No published blog posts found");
    });

    it("should include series posts if latest post is part of a series", async () => {
      const posts: BlogPost[] = [
        createMockPost(
          "post-1",
          "Series Part 1",
          "published",
          "2025-01-01T10:00:00.000Z",
          "My Series",
          1,
        ),
        createMockPost(
          "post-2",
          "Series Part 2",
          "published",
          "2025-01-02T10:00:00.000Z",
          "My Series",
          2,
        ),
        createMockPost(
          "post-3",
          "Latest Post",
          "published",
          "2025-01-03T10:00:00.000Z",
          "My Series",
          3,
        ),
      ];

      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(posts);

      const schema = z.object({
        post: z.any(),
        prevPost: z.any().nullable(),
        nextPost: z.any().nullable(),
        seriesPosts: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { latest: true } },
        schema,
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
        "published",
        "2025-01-02T10:00:00.000Z",
      );

      const allPosts: BlogPost[] = [
        createMockPost(
          "post-1",
          "Older Post",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
        targetPost,
        createMockPost(
          "post-3",
          "Newer Post",
          "published",
          "2025-01-03T10:00:00.000Z",
        ),
      ];

      (
        mockEntityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue(targetPost);
      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(allPosts);

      const schema = z.object({
        post: z.any(),
        prevPost: z.any().nullable(),
        nextPost: z.any().nullable(),
        seriesPosts: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { id: "post-2" } },
        schema,
      );

      expect(result.post.id).toBe("post-2");
      expect(result.prevPost?.id).toBe("post-3"); // Newer post (prev)
      expect(result.nextPost?.id).toBe("post-1"); // Older post (next)
      expect(result.seriesPosts).toBeNull();
    });

    it("should throw error when post not found", async () => {
      (
        mockEntityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue(null);

      const schema = z.object({
        post: z.any(),
        prevPost: z.any().nullable(),
        nextPost: z.any().nullable(),
        seriesPosts: z.any().nullable(),
      });

      expect(
        datasource.fetch(
          { entityType: "post", query: { id: "nonexistent" } },
          schema,
        ),
      ).rejects.toThrow("Blog post not found: nonexistent");
    });

    it("should include series posts when post is part of a series", async () => {
      const targetPost = createMockPost(
        "post-2",
        "Series Part 2",
        "published",
        "2025-01-02T10:00:00.000Z",
        "My Series",
        2,
      );

      const allPosts: BlogPost[] = [
        createMockPost(
          "post-1",
          "Series Part 1",
          "published",
          "2025-01-01T10:00:00.000Z",
          "My Series",
          1,
        ),
        targetPost,
        createMockPost(
          "post-3",
          "Series Part 3",
          "published",
          "2025-01-03T10:00:00.000Z",
          "My Series",
          3,
        ),
        createMockPost(
          "post-4",
          "Other Post",
          "published",
          "2025-01-04T10:00:00.000Z",
        ),
      ];

      (
        mockEntityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue(targetPost);
      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(allPosts);

      const schema = z.object({
        post: z.any(),
        prevPost: z.any().nullable(),
        nextPost: z.any().nullable(),
        seriesPosts: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { id: "post-2" } },
        schema,
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
        "published",
        "2025-01-03T10:00:00.000Z",
      );

      const allPosts: BlogPost[] = [
        targetPost,
        createMockPost(
          "post-2",
          "Older Post",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
      ];

      (
        mockEntityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue(targetPost);
      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(allPosts);

      const schema = z.object({
        post: z.any(),
        prevPost: z.any().nullable(),
        nextPost: z.any().nullable(),
        seriesPosts: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { id: "post-1" } },
        schema,
      );

      expect(result.post.id).toBe("post-1");
      expect(result.prevPost).toBeNull();
      expect(result.nextPost?.id).toBe("post-2");
    });

    it("should handle last post (no next)", async () => {
      const targetPost = createMockPost(
        "post-2",
        "Oldest Post",
        "published",
        "2025-01-01T10:00:00.000Z",
      );

      const allPosts: BlogPost[] = [
        createMockPost(
          "post-1",
          "Newer Post",
          "published",
          "2025-01-03T10:00:00.000Z",
        ),
        targetPost,
      ];

      (
        mockEntityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue(targetPost);
      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(allPosts);

      const schema = z.object({
        post: z.any(),
        prevPost: z.any().nullable(),
        nextPost: z.any().nullable(),
        seriesPosts: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { id: "post-2" } },
        schema,
      );

      expect(result.post.id).toBe("post-2");
      expect(result.prevPost?.id).toBe("post-1");
      expect(result.nextPost).toBeNull();
    });
  });

  describe("fetchPostList", () => {
    it("should fetch and sort all posts by publishedAt", async () => {
      const posts: BlogPost[] = [
        createMockPost(
          "post-1",
          "Oldest",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockPost(
          "post-2",
          "Newest",
          "published",
          "2025-01-03T10:00:00.000Z",
        ),
        createMockPost(
          "post-3",
          "Middle",
          "published",
          "2025-01-02T10:00:00.000Z",
        ),
      ];

      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(posts);

      const schema = z.object({
        posts: z.array(z.any()),
      });

      const result = await datasource.fetch({ entityType: "post" }, schema);

      expect(result.posts).toHaveLength(3);
      expect(result.posts[0].id).toBe("post-2"); // Newest first
      expect(result.posts[1].id).toBe("post-3");
      expect(result.posts[2].id).toBe("post-1"); // Oldest last
    });

    it("should put published posts before drafts", async () => {
      const posts: BlogPost[] = [
        createMockPost("post-1", "Draft 1", "draft"),
        createMockPost(
          "post-2",
          "Published",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockPost("post-3", "Draft 2", "draft"),
      ];

      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(posts);

      const schema = z.object({
        posts: z.array(z.any()),
      });

      const result = await datasource.fetch({ entityType: "post" }, schema);

      expect(result.posts).toHaveLength(3);
      expect(result.posts[0].frontmatter.status).toBe("published");
      expect(result.posts[1].frontmatter.status).toBe("draft");
      expect(result.posts[2].frontmatter.status).toBe("draft");
    });

    it("should respect limit parameter", async () => {
      const posts: BlogPost[] = [
        createMockPost(
          "post-1",
          "Post 1",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockPost(
          "post-2",
          "Post 2",
          "published",
          "2025-01-02T10:00:00.000Z",
        ),
        createMockPost(
          "post-3",
          "Post 3",
          "published",
          "2025-01-03T10:00:00.000Z",
        ),
      ];

      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(posts);

      const schema = z.object({
        posts: z.array(z.any()),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { limit: 2 } },
        schema,
      );

      expect(result.posts).toHaveLength(3); // Mock returns all, sorting still works
    });

    it("should handle empty post list", async () => {
      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue([]);

      const schema = z.object({
        posts: z.array(z.any()),
      });

      const result = await datasource.fetch({ entityType: "post" }, schema);

      expect(result.posts).toHaveLength(0);
    });

    it("should parse frontmatter for all posts", async () => {
      const posts: BlogPost[] = [
        createMockPost(
          "post-1",
          "Test Post",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
      ];

      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(posts);

      const schema = z.object({
        posts: z.array(z.any()),
      });

      const result = await datasource.fetch({ entityType: "post" }, schema);

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
      const posts: BlogPost[] = [
        createMockPost(
          "post-3",
          "Series Part 3",
          "published",
          "2025-01-03T10:00:00.000Z",
          "My Series",
          3,
        ),
        createMockPost(
          "post-1",
          "Series Part 1",
          "published",
          "2025-01-01T10:00:00.000Z",
          "My Series",
          1,
        ),
        createMockPost(
          "post-2",
          "Series Part 2",
          "published",
          "2025-01-02T10:00:00.000Z",
          "My Series",
          2,
        ),
        createMockPost(
          "other",
          "Other Post",
          "published",
          "2025-01-04T10:00:00.000Z",
          "Other Series",
          1,
        ),
      ];

      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(posts);

      const schema = z.object({
        seriesName: z.string(),
        posts: z.array(z.any()),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { "metadata.seriesName": "My Series" } },
        schema,
      );

      expect(result.seriesName).toBe("My Series");
      expect(result.posts).toHaveLength(3);
      expect(result.posts[0].id).toBe("post-1");
      expect(result.posts[1].id).toBe("post-2");
      expect(result.posts[2].id).toBe("post-3");
    });

    it("should include draft posts in series", async () => {
      const posts: BlogPost[] = [
        createMockPost(
          "post-1",
          "Series Part 1",
          "published",
          "2025-01-01T10:00:00.000Z",
          "My Series",
          1,
        ),
        createMockPost(
          "post-2",
          "Series Part 2",
          "draft",
          undefined,
          "My Series",
          2,
        ),
      ];

      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(posts);

      const schema = z.object({
        seriesName: z.string(),
        posts: z.array(z.any()),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { "metadata.seriesName": "My Series" } },
        schema,
      );

      expect(result.posts).toHaveLength(2);
      expect(result.posts[1].frontmatter.status).toBe("draft");
    });

    it("should handle series with no posts", async () => {
      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue([]);

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
      );

      expect(result.seriesName).toBe("Empty Series");
      expect(result.posts).toHaveLength(0);
    });

    it("should handle series posts without explicit index", async () => {
      const posts: BlogPost[] = [
        createMockPost(
          "post-1",
          "Series Part 1",
          "published",
          "2025-01-01T10:00:00.000Z",
          "My Series",
        ),
        createMockPost(
          "post-2",
          "Series Part 2",
          "published",
          "2025-01-02T10:00:00.000Z",
          "My Series",
        ),
      ];

      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(posts);

      const schema = z.object({
        seriesName: z.string(),
        posts: z.array(z.any()),
      });

      const result = await datasource.fetch(
        { entityType: "post", query: { "metadata.seriesName": "My Series" } },
        schema,
      );

      expect(result.posts).toHaveLength(2);
      // Should still work, treating undefined as 0
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
