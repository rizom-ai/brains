import { describe, it, expect, beforeEach } from "bun:test";
import { SocialPostDataSource } from "../../src/datasources/social-post-datasource";
import { createSilentLogger } from "@brains/test-utils";
import {
  MockShell,
  createServicePluginContext,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins/test";
import type { BaseDataSourceContext } from "@brains/plugins";
import { z } from "@brains/utils";

// Output schema for testing list queries
const postListSchema = z.object({
  posts: z.array(z.any()),
  totalCount: z.number(),
});

// Output schema for single post queries
const singlePostSchema = z.object({
  post: z.any().nullable(),
});

describe("SocialPostDataSource", () => {
  let dataSource: SocialPostDataSource;
  let context: ServicePluginContext;
  let mockContext: BaseDataSourceContext;
  let logger: Logger;
  let mockShell: MockShell;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    context = createServicePluginContext(mockShell, "social-media");
    mockContext = { entityService: context.entityService };
    dataSource = new SocialPostDataSource(logger);
  });

  describe("instantiation", () => {
    it("should be instantiable", () => {
      expect(dataSource).toBeDefined();
    });

    it("should have correct metadata", () => {
      expect(dataSource.id).toBe("social-media:posts");
      expect(dataSource.name).toBeDefined();
      expect(dataSource.description).toBeDefined();
    });
  });

  describe("fetch", () => {
    it("should fetch empty list when no posts exist", async () => {
      const result = await dataSource.fetch(
        { entityType: "social-post" },
        postListSchema,
        mockContext,
      );
      expect(result).toBeDefined();
      expect(result.posts).toBeInstanceOf(Array);
      expect(result.posts.length).toBe(0);
      expect(result.totalCount).toBe(0);
    });

    it("should accept platform filter in query", async () => {
      // Test that the query schema accepts platform filter
      // (actual filtering is done by entity service, not datasource)
      const result = await dataSource.fetch(
        {
          entityType: "social-post",
          query: { platform: "linkedin" },
        },
        postListSchema,
        mockContext,
      );
      expect(result).toBeDefined();
      expect(result.posts).toBeInstanceOf(Array);
    });

    it("should accept status filter in query", async () => {
      const result = await dataSource.fetch(
        {
          entityType: "social-post",
          query: { status: "queued" },
        },
        postListSchema,
        mockContext,
      );
      expect(result).toBeDefined();
      expect(result.posts).toBeInstanceOf(Array);
    });

    it("should accept sortByQueue option", async () => {
      const result = await dataSource.fetch(
        {
          entityType: "social-post",
          query: { status: "queued", sortByQueue: true },
        },
        postListSchema,
        mockContext,
      );
      expect(result).toBeDefined();
      expect(result.posts).toBeInstanceOf(Array);
    });

    it("should return null post for nextInQueue when no queued posts", async () => {
      const result = await dataSource.fetch(
        {
          entityType: "social-post",
          query: { nextInQueue: true },
        },
        singlePostSchema,
        mockContext,
      );
      expect(result.post).toBeNull();
    });

    it("should throw error when post not found by id", async () => {
      let error: Error | null = null;
      try {
        await dataSource.fetch(
          {
            entityType: "social-post",
            query: { id: "non-existent-slug" },
          },
          singlePostSchema,
          mockContext,
        );
      } catch (e) {
        error = e as Error;
      }
      expect(error).not.toBeNull();
      expect(error?.message).toContain("Social post not found");
    });

    it("should accept limit option", async () => {
      const result = await dataSource.fetch(
        {
          entityType: "social-post",
          query: { limit: 5 },
        },
        postListSchema,
        mockContext,
      );
      expect(result).toBeDefined();
      expect(result.posts).toBeInstanceOf(Array);
    });
  });
});
