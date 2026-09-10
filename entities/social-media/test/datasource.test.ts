import { createTestEntity } from "@brains/entity-service/test";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import { describe, it, expect, beforeEach } from "bun:test";
import { SocialPostDataSource } from "../src/datasources/social-post-datasource";
import type { SocialPost } from "../src/schemas/social-post";
import type { BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { createMockLogger } from "@brains/test-utils";

describe("SocialPostDataSource", () => {
  let datasource: SocialPostDataSource;
  let shell: MockShell;
  let mockLogger: Logger;
  let mockContext: BaseDataSourceContext;

  const createMockSocialPost = (
    id: string,
    title: string,
    slug: string,
    status: "draft" | "queued" | "published" | "failed",
    body: string,
    opts: { publishedAt?: string; created?: string } = {},
  ): SocialPost => {
    const content = `---
title: ${title}
platform: linkedin
status: ${status}
---

${body}`;
    return createTestEntity<SocialPost>("social-post", {
      id,
      content,
      ...(opts.created && { created: opts.created, updated: opts.created }),
      metadata: {
        title,
        slug,
        platform: "linkedin",
        status,
        ...(opts.publishedAt && { publishedAt: opts.publishedAt }),
      },
    });
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    shell = createMockShell();
    mockContext = { entityService: shell.getEntityService() };

    datasource = new SocialPostDataSource(mockLogger);
  });

  describe("fetch by id (slug)", () => {
    it("should fetch a single post by slug", async () => {
      shell.addEntities([
        createMockSocialPost(
          "post-1",
          "My LinkedIn Post",
          "my-linkedin-post",
          "published",
          "This is my LinkedIn post content.",
        ),
        createMockSocialPost(
          "post-2",
          "Other Post",
          "other-post",
          "published",
          "Other content.",
        ),
      ]);

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
    });

    it("should throw error when post not found", async () => {
      const schema = z.object({ post: z.any() });

      void expect(
        datasource.fetch(
          { entityType: "social-post", query: { id: "nonexistent" } },
          schema,
          mockContext,
        ),
      ).rejects.toThrow("not found with slug: nonexistent");
    });
  });

  describe("fetch list", () => {
    const listSchema = z.object({
      posts: z.array(z.object({ id: z.string() })),
      totalCount: z.number(),
    });

    it("should sort published posts first, newest publish date leading", async () => {
      // Sort contract: publishedAt desc with nullsFirst (unpublished posts
      // lead), then created desc as the tie-breaker.
      shell.addEntities([
        createMockSocialPost(
          "post-older-published",
          "Older Published",
          "older-published",
          "published",
          "Older",
          {
            publishedAt: "2026-01-01T10:00:00.000Z",
            created: "2026-01-01T09:00:00.000Z",
          },
        ),
        createMockSocialPost(
          "post-newer-published",
          "Newer Published",
          "newer-published",
          "published",
          "Newer",
          {
            publishedAt: "2026-01-03T10:00:00.000Z",
            created: "2026-01-01T08:00:00.000Z",
          },
        ),
        createMockSocialPost(
          "post-draft",
          "Draft Post",
          "draft-post",
          "draft",
          "Draft",
          { created: "2026-01-02T10:00:00.000Z" },
        ),
      ]);

      const result = await datasource.fetch(
        { entityType: "social-post", query: {} },
        listSchema,
        mockContext,
      );

      expect(result.totalCount).toBe(3);
      expect(result.posts.map((post) => post.id)).toEqual([
        "post-draft",
        "post-newer-published",
        "post-older-published",
      ]);
    });

    it("should filter by status", async () => {
      shell.addEntities([
        createMockSocialPost(
          "post-1",
          "Queued Post",
          "queued-post",
          "queued",
          "Queued post content",
        ),
        createMockSocialPost(
          "post-2",
          "Published Post",
          "published-post",
          "published",
          "Published content",
          { publishedAt: "2026-01-01T10:00:00.000Z" },
        ),
      ]);

      const result = await datasource.fetch(
        { entityType: "social-post", query: { status: "queued" } },
        listSchema,
        mockContext,
      );

      expect(result.posts.map((post) => post.id)).toEqual(["post-1"]);
    });

    it("should return an empty list when no posts exist", async () => {
      const result = await datasource.fetch(
        { entityType: "social-post" },
        listSchema,
        mockContext,
      );

      expect(result.posts).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    it("should respect the limit option", async () => {
      shell.addEntities(
        Array.from({ length: 5 }, (_, i) =>
          createMockSocialPost(
            `post-${i + 1}`,
            `Post ${i + 1}`,
            `post-${i + 1}`,
            "published",
            "Content",
            {
              publishedAt: `2026-01-0${i + 1}T10:00:00.000Z`,
            },
          ),
        ),
      );

      const result = await datasource.fetch(
        { entityType: "social-post", query: { limit: 2 } },
        listSchema,
        mockContext,
      );

      expect(result.posts.map((post) => post.id)).toEqual(["post-5", "post-4"]);
    });

    it("should filter by platform", async () => {
      shell.addEntities([
        createMockSocialPost(
          "post-1",
          "LinkedIn Post",
          "linkedin-post",
          "published",
          "LinkedIn content",
          { publishedAt: "2026-01-01T10:00:00.000Z" },
        ),
      ]);

      const result = await datasource.fetch(
        { entityType: "social-post", query: { platform: "linkedin" } },
        listSchema,
        mockContext,
      );

      expect(result.posts).toHaveLength(1);
    });
  });

  describe("pagination", () => {
    const paginatedSchema = z.object({
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

    /** Seed post-1..post-N, published ascending by index. */
    function seedNumberedPosts(count: number): void {
      shell.addEntities(
        Array.from({ length: count }, (_, i) =>
          createMockSocialPost(
            `post-${i + 1}`,
            `Post ${i + 1}`,
            `post-${i + 1}`,
            "published",
            `Post ${i + 1} content`,
            {
              publishedAt: `2026-01-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
            },
          ),
        ),
      );
    }

    it("should return pagination info when page is specified", async () => {
      seedNumberedPosts(25);

      const result = await datasource.fetch(
        { entityType: "social-post", query: { page: 1, pageSize: 10 } },
        paginatedSchema,
        mockContext,
      );

      expect(result.pagination).not.toBeNull();
      expect(result.pagination?.currentPage).toBe(1);
      expect(result.pagination?.totalItems).toBe(25);
      expect(result.pagination?.totalPages).toBe(3);
      expect(result.pagination?.pageSize).toBe(10);
    });

    it("should return the second page of posts for page 2", async () => {
      seedNumberedPosts(25);

      const result = await datasource.fetch(
        { entityType: "social-post", query: { page: 2, pageSize: 10 } },
        paginatedSchema,
        mockContext,
      );

      // Sorted newest-first, so page 2 starts at post-15.
      expect(result.posts).toHaveLength(10);
      expect(result.posts[0]?.id).toBe("post-15");
      expect(result.posts[9]?.id).toBe("post-6");
      expect(result.pagination?.currentPage).toBe(2);
    });
  });
});
