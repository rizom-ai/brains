import { createPluginHarness, type MockShell } from "@brains/plugins/test";
import { describe, it, expect, beforeEach } from "bun:test";
import type {
  BaseDataSourceContext,
  BaseEntity,
  DataSource,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { blogPlugin } from "./blog-plugin";
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
    z.looseObject({
      id: z.string(),
      entityType: z.string(),
      frontmatter: z.looseObject({
        title: z.string(),
        slug: z.string(),
        status: z.string(),
      }),
      body: z.string(),
    }),
  ),
  pagination: paginationSchema.nullable(),
});

describe("the blog data source", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let datasource: DataSource & Required<Pick<DataSource, "fetch">>;
  let shell: MockShell;
  let mockContext: BaseDataSourceContext;

  function seed(posts: BaseEntity[]): void {
    shell.addEntities(posts);
  }

  beforeEach(async () => {
    harness = createPluginHarness();
    await harness.installPlugin(blogPlugin());
    shell = harness.getMockShell();
    mockContext = { entityService: shell.getEntityService() };
    const registered = harness.getDataSources().get("blog:entities");
    if (!registered?.fetch) throw new Error("No blog data source");
    datasource = { ...registered, fetch: registered.fetch.bind(registered) };
  });

  describe("fetchSinglePost", () => {
    it("should fetch a single post by slug with navigation", async () => {
      seed([
        createMockPost("post-1", "Older Post", "older-post", "published", {
          publishedAt: "2025-01-01T10:00:00.000Z",
        }),
        createMockPost("post-2", "Middle Post", "middle-post", "published", {
          publishedAt: "2025-01-02T10:00:00.000Z",
        }),
        createMockPost("post-3", "Newer Post", "newer-post", "published", {
          publishedAt: "2025-01-03T10:00:00.000Z",
        }),
      ]);

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
      expect(
        datasource.fetch(
          { entityType: "post", query: { id: "nonexistent-slug" } },
          singlePostSchema,
          mockContext,
        ),
      ).rejects.toThrow("not found with slug: nonexistent-slug");
    });

    it("should include series posts when post is part of a series", async () => {
      seed([
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
        createMockPost("post-4", "Other Post", "other-post", "published", {
          publishedAt: "2025-01-04T10:00:00.000Z",
        }),
      ]);

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
      seed([
        createMockPost("post-1", "First Post", "first-post", "published", {
          publishedAt: "2025-01-03T10:00:00.000Z",
        }),
        createMockPost("post-2", "Older Post", "older-post", "published", {
          publishedAt: "2025-01-01T10:00:00.000Z",
        }),
      ]);

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
      seed([
        createMockPost("post-1", "Newer Post", "newer-post", "published", {
          publishedAt: "2025-01-03T10:00:00.000Z",
        }),
        createMockPost("post-2", "Oldest Post", "oldest-post", "published", {
          publishedAt: "2025-01-01T10:00:00.000Z",
        }),
      ]);

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
      seed([
        createMockPost("post-1", "Oldest", "oldest", "published", {
          publishedAt: "2025-01-01T10:00:00.000Z",
        }),
        createMockPost("post-2", "Newest", "newest", "published", {
          publishedAt: "2025-01-03T10:00:00.000Z",
        }),
        createMockPost("post-3", "Middle", "middle", "published", {
          publishedAt: "2025-01-02T10:00:00.000Z",
        }),
      ]);

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

    it("accepts datasource output before site URL enrichment", async () => {
      seed([
        createMockPost("post-1", "Published", "published", "published", {
          publishedAt: "2025-01-01T10:00:00.000Z",
        }),
      ]);

      const templateSchema = harness
        .getTemplates()
        .get("blog:post-list")?.schema;
      if (!templateSchema) throw new Error("post-list template not found");

      const result = await datasource.fetch(
        { entityType: "post", query: { page: 1, pageSize: 10 } },
        templateSchema,
        mockContext,
      );

      const parsed = postListSchema.parse(result);
      expect(parsed.posts).toHaveLength(1);
      expect(parsed.posts[0]?.url).toBeNull();
      expect(parsed.posts[0]?.typeLabel).toBeNull();
      expect(
        z.looseObject({ baseUrl: z.null() }).parse(result).baseUrl,
      ).toBeNull();
      expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
    });

    it("should sort drafts without publishedAt after published posts", async () => {
      seed([
        createMockPost("post-1", "Draft 1", "draft-1", "draft"),
        createMockPost("post-2", "Published", "published", "published", {
          publishedAt: "2025-01-01T10:00:00.000Z",
        }),
        createMockPost("post-3", "Draft 2", "draft-2", "draft"),
      ]);

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
      seed([
        createMockPost("post-1", "Post 1", "post-1", "published", {
          publishedAt: "2025-01-01T10:00:00.000Z",
        }),
        createMockPost("post-2", "Post 2", "post-2", "published", {
          publishedAt: "2025-01-02T10:00:00.000Z",
        }),
        createMockPost("post-3", "Post 3", "post-3", "published", {
          publishedAt: "2025-01-03T10:00:00.000Z",
        }),
      ]);

      const result = await datasource.fetch(
        { entityType: "post", query: { limit: 2 } },
        paginatedListSchema,
        mockContext,
      );

      expect(result.posts).toHaveLength(2);
      expect(result.posts.map((post) => post.id)).toEqual(["post-3", "post-2"]);
    });

    it("should handle empty post list", async () => {
      const result = await datasource.fetch(
        { entityType: "post" },
        paginatedListSchema,
        mockContext,
      );

      expect(result.posts).toHaveLength(0);
    });

    it("should parse frontmatter for all posts", async () => {
      seed([
        createMockPost("post-1", "Test Post", "test-post", "published", {
          publishedAt: "2025-01-01T10:00:00.000Z",
        }),
      ]);

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

  describe("pagination", () => {
    /** Seed posts post-1..post-N with publishedAt ascending by index. */
    function seedNumberedPosts(count: number): void {
      seed(
        Array.from({ length: count }, (_, i) =>
          createMockPost(
            `post-${i + 1}`,
            `Post ${i + 1}`,
            `post-${i + 1}`,
            "published",
            {
              publishedAt: `2025-01-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
            },
          ),
        ),
      );
    }

    it("should return paginated posts when page is specified", async () => {
      seedNumberedPosts(10);

      const result = await datasource.fetch(
        { entityType: "post", query: { page: 1, pageSize: 3 } },
        paginatedListSchema,
        mockContext,
      );

      expect(result.posts.map((post) => post.id)).toEqual([
        "post-10",
        "post-9",
        "post-8",
      ]);
      expect(result.pagination).not.toBeNull();
      expect(result.pagination?.currentPage).toBe(1);
      expect(result.pagination?.totalPages).toBe(4);
      expect(result.pagination?.totalItems).toBe(10);
      expect(result.pagination?.pageSize).toBe(3);
      expect(result.pagination?.hasNextPage).toBe(true);
      expect(result.pagination?.hasPrevPage).toBe(false);
    });

    it("should return correct posts for page 2", async () => {
      seedNumberedPosts(10);

      const result = await datasource.fetch(
        { entityType: "post", query: { page: 2, pageSize: 3 } },
        paginatedListSchema,
        mockContext,
      );

      expect(result.posts.map((post) => post.id)).toEqual([
        "post-7",
        "post-6",
        "post-5",
      ]);
      expect(result.pagination?.currentPage).toBe(2);
      expect(result.pagination?.hasNextPage).toBe(true);
      expect(result.pagination?.hasPrevPage).toBe(true);
    });

    it("should return correct posts for last page", async () => {
      seedNumberedPosts(10);

      const result = await datasource.fetch(
        { entityType: "post", query: { page: 4, pageSize: 3 } },
        paginatedListSchema,
        mockContext,
      );

      expect(result.posts.map((post) => post.id)).toEqual(["post-1"]);
      expect(result.pagination?.currentPage).toBe(4);
      expect(result.pagination?.hasNextPage).toBe(false);
      expect(result.pagination?.hasPrevPage).toBe(true);
    });

    it("should return null pagination when page is not specified", async () => {
      seedNumberedPosts(1);

      const result = await datasource.fetch(
        { entityType: "post" },
        paginatedListSchema,
        mockContext,
      );

      expect(result.pagination).toBeNull();
    });

    it("should handle empty results with pagination", async () => {
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

    it("counts all matching posts, not just the returned page", async () => {
      seedNumberedPosts(3);

      const result = await datasource.fetch(
        { entityType: "post", query: { page: 1, pageSize: 2 } },
        paginatedListSchema,
        mockContext,
      );

      expect(result.posts).toHaveLength(2);
      expect(result.pagination?.totalItems).toBe(3);
      expect(result.pagination?.totalPages).toBe(2);
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
