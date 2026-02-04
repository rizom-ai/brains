import { describe, it, expect, beforeEach, spyOn, type Mock } from "bun:test";
import { SocialPostDataSource } from "../src/datasources/social-post-datasource";
import type { SocialPost } from "../src/schemas/social-post";
import type { IEntityService, BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import {
  createMockLogger,
  createMockEntityService,
  createTestEntity,
} from "@brains/test-utils";

describe("SocialPostDataSource", () => {
  let datasource: SocialPostDataSource;
  let mockEntityService: IEntityService;
  let mockLogger: Logger;
  let mockContext: BaseDataSourceContext;
  let listEntitiesSpy: Mock<(...args: unknown[]) => Promise<unknown>>;
  let countEntitiesSpy: Mock<(...args: unknown[]) => Promise<unknown>>;

  const createMockSocialPost = (
    id: string,
    title: string,
    slug: string,
    status: "draft" | "queued" | "published" | "failed",
    body: string,
    queueOrder?: number,
  ): SocialPost => {
    const content = `---
title: ${title}
platform: linkedin
status: ${status}
${queueOrder !== undefined ? `queueOrder: ${queueOrder}` : ""}
retryCount: 0
---

${body}`;
    return createTestEntity<SocialPost>("social-post", {
      id,
      content,
      metadata: {
        title,
        slug,
        platform: "linkedin",
        status,
        queueOrder,
      },
    });
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockEntityService = createMockEntityService();
    mockContext = { entityService: mockEntityService };

    listEntitiesSpy = spyOn(
      mockEntityService,
      "listEntities",
    ) as unknown as typeof listEntitiesSpy;

    countEntitiesSpy = spyOn(
      mockEntityService,
      "countEntities",
    ) as unknown as typeof countEntitiesSpy;

    datasource = new SocialPostDataSource(mockLogger);
  });

  describe("fetch by id (slug)", () => {
    it("should fetch a single post by slug", async () => {
      const mockPost = createMockSocialPost(
        "post-1",
        "My LinkedIn Post",
        "linkedin-my-linkedin-post-20260114",
        "published",
        "This is my LinkedIn post content.",
      );
      listEntitiesSpy.mockResolvedValue([mockPost]);

      const schema = z.object({
        post: z.object({
          id: z.string(),
          body: z.string(),
          frontmatter: z.object({
            platform: z.string(),
            status: z.string(),
          }),
        }),
      });

      const result = await datasource.fetch(
        { entityType: "social-post", query: { id: "my-linkedin-post" } },
        schema,
        mockContext,
      );

      expect(result.post.id).toBe("post-1");
      expect(result.post.body).toContain("This is my LinkedIn post content");
      expect(result.post.frontmatter.platform).toBe("linkedin");
      expect(listEntitiesSpy).toHaveBeenCalledWith("social-post", {
        filter: { metadata: { slug: "my-linkedin-post" } },
        limit: 1,
      });
    });

    it("should throw error when post not found", async () => {
      listEntitiesSpy.mockResolvedValue([]);

      const schema = z.object({ post: z.any() });

      void expect(
        datasource.fetch(
          { entityType: "social-post", query: { id: "nonexistent" } },
          schema,
          mockContext,
        ),
      ).rejects.toThrow("Social post not found with slug: nonexistent");
    });
  });

  describe("fetch list", () => {
    it("should fetch all posts sorted by created date", async () => {
      const posts = [
        createMockSocialPost(
          "post-1",
          "Post One",
          "linkedin-post-one-20260114",
          "published",
          "Post 1 content",
        ),
        createMockSocialPost(
          "post-2",
          "Post Two",
          "linkedin-post-two-20260114",
          "queued",
          "Post 2 content",
        ),
      ];
      listEntitiesSpy.mockResolvedValue(posts);

      const schema = z.object({
        posts: z.array(z.object({ id: z.string() })),
        totalCount: z.number(),
      });

      const result = await datasource.fetch(
        { entityType: "social-post", query: {} },
        schema,
        mockContext,
      );

      expect(result.posts).toHaveLength(2);
      expect(result.totalCount).toBe(2);
      expect(listEntitiesSpy).toHaveBeenCalledWith("social-post", {
        sortFields: [{ field: "created", direction: "desc" }],
        limit: 100,
        offset: 0,
      });
    });

    it("should filter by status", async () => {
      const posts = [
        createMockSocialPost(
          "post-1",
          "Queued Post",
          "linkedin-queued-post-20260114",
          "queued",
          "Queued post content",
          1,
        ),
      ];
      listEntitiesSpy.mockResolvedValue(posts);

      const schema = z.object({
        posts: z.array(z.object({ id: z.string() })),
        totalCount: z.number(),
      });

      const result = await datasource.fetch(
        { entityType: "social-post", query: { status: "queued" } },
        schema,
        mockContext,
      );

      expect(result.posts).toHaveLength(1);
      expect(listEntitiesSpy).toHaveBeenCalledWith("social-post", {
        filter: { metadata: { status: "queued" } },
        sortFields: [{ field: "created", direction: "desc" }],
        limit: 100,
        offset: 0,
      });
    });

    it("should sort by queue order when sortByQueue is true", async () => {
      const posts = [
        createMockSocialPost(
          "post-1",
          "Post One",
          "linkedin-post-one-20260114",
          "queued",
          "Post 1 content",
          1,
        ),
        createMockSocialPost(
          "post-2",
          "Post Two",
          "linkedin-post-two-20260114",
          "queued",
          "Post 2 content",
          2,
        ),
      ];
      listEntitiesSpy.mockResolvedValue(posts);

      const schema = z.object({
        posts: z.array(z.object({ id: z.string() })),
        totalCount: z.number(),
      });

      await datasource.fetch(
        { entityType: "social-post", query: { sortByQueue: true } },
        schema,
        mockContext,
      );

      expect(listEntitiesSpy).toHaveBeenCalledWith("social-post", {
        sortFields: [{ field: "queueOrder", direction: "asc" }],
        limit: 100,
        offset: 0,
      });
    });
  });

  describe("pagination", () => {
    it("should return pagination info when page is specified", async () => {
      listEntitiesSpy.mockResolvedValue([
        createMockSocialPost(
          "post-1",
          "Post One",
          "linkedin-post-one-20260114",
          "published",
          "Post 1 content",
        ),
      ]);
      countEntitiesSpy.mockResolvedValue(25);

      const schema = z.object({
        posts: z.array(z.object({ id: z.string() })),
        totalCount: z.number(),
        pagination: z
          .object({
            currentPage: z.number(),
            totalPages: z.number(),
            totalItems: z.number(),
            pageSize: z.number(),
          })
          .nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "social-post", query: { page: 1, pageSize: 10 } },
        schema,
        mockContext,
      );

      expect(result.pagination).not.toBeNull();
      expect(result.pagination?.currentPage).toBe(1);
      expect(result.pagination?.totalItems).toBe(25);
      expect(result.pagination?.totalPages).toBe(3);
      expect(result.pagination?.pageSize).toBe(10);
    });

    it("should calculate correct offset for page 2", async () => {
      listEntitiesSpy.mockResolvedValue([]);
      countEntitiesSpy.mockResolvedValue(25);

      const schema = z.object({
        posts: z.array(z.any()),
        totalCount: z.number(),
        pagination: z.any().nullable(),
      });

      await datasource.fetch(
        { entityType: "social-post", query: { page: 2, pageSize: 10 } },
        schema,
        mockContext,
      );

      expect(listEntitiesSpy).toHaveBeenCalledWith("social-post", {
        sortFields: [{ field: "created", direction: "desc" }],
        limit: 10,
        offset: 10,
      });
    });
  });

  describe("nextInQueue", () => {
    it("should fetch the next queued post", async () => {
      const posts = [
        createMockSocialPost(
          "post-1",
          "Next Post",
          "linkedin-next-post-20260114",
          "queued",
          "Next post content",
          1,
        ),
      ];
      listEntitiesSpy.mockResolvedValue(posts);

      const schema = z.object({
        post: z.object({ id: z.string() }).nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "social-post", query: { nextInQueue: true } },
        schema,
        mockContext,
      );

      expect(result.post?.id).toBe("post-1");
      expect(listEntitiesSpy).toHaveBeenCalledWith("social-post", {
        filter: { metadata: { status: "queued" } },
        sortFields: [{ field: "queueOrder", direction: "asc" }],
        limit: 1,
      });
    });

    it("should return null when queue is empty", async () => {
      listEntitiesSpy.mockResolvedValue([]);

      const schema = z.object({
        post: z.object({ id: z.string() }).nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "social-post", query: { nextInQueue: true } },
        schema,
        mockContext,
      );

      expect(result.post).toBeNull();
    });
  });
});
