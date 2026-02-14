import { describe, it, expect, beforeEach, spyOn, type Mock } from "bun:test";
import { NewsletterDataSource } from "../../src/datasources/newsletter-datasource";
import type { Newsletter } from "../../src/schemas/newsletter";
import type { IEntityService, BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import {
  createMockLogger,
  createMockEntityService,
  createTestEntity,
} from "@brains/test-utils";

describe("NewsletterDataSource", () => {
  let datasource: NewsletterDataSource;
  let mockEntityService: IEntityService;
  let mockLogger: Logger;
  let mockContext: BaseDataSourceContext;
  let listEntitiesSpy: Mock<(...args: unknown[]) => Promise<unknown>>;
  let getEntitySpy: Mock<(...args: unknown[]) => Promise<unknown>>;

  // Helper to create mock newsletter
  const createMockNewsletter = (
    id: string,
    subject: string,
    status: "draft" | "queued" | "published" | "failed",
    content: string = "Newsletter content",
    sentAt?: string,
    entityIds?: string[],
  ): Newsletter => {
    return createTestEntity<Newsletter>("newsletter", {
      id,
      content,
      metadata: {
        subject,
        status,
        sentAt,
        entityIds,
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

    getEntitySpy = spyOn(
      mockEntityService,
      "getEntity",
    ) as unknown as typeof getEntitySpy;

    datasource = new NewsletterDataSource(mockLogger);
  });

  describe("metadata", () => {
    it("should have correct datasource ID", () => {
      expect(datasource.id).toBe("newsletter:entities");
    });

    it("should have descriptive name and description", () => {
      expect(datasource.name).toBe("Newsletter Entity DataSource");
      expect(datasource.description).toContain("newsletter entities");
    });
  });

  describe("fetchNewsletterList", () => {
    it("should fetch all newsletters sorted by created date", async () => {
      const newsletters: Newsletter[] = [
        createMockNewsletter(
          "nl-1",
          "First Newsletter",
          "published",
          "Content 1",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockNewsletter("nl-2", "Second Newsletter", "draft", "Content 2"),
      ];

      listEntitiesSpy.mockResolvedValue(newsletters);

      const schema = z.object({
        newsletters: z.array(z.any()),
        pagination: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "newsletter" },
        schema,
        mockContext,
      );

      expect(result.newsletters).toHaveLength(2);
      expect(result.newsletters[0].id).toBe("nl-1");
      expect(result.newsletters[0].subject).toBe("First Newsletter");
    });

    it("should enrich newsletters with excerpt from content", async () => {
      const longContent = "A".repeat(200);
      const newsletters: Newsletter[] = [
        createMockNewsletter("nl-1", "Test Newsletter", "draft", longContent),
      ];

      listEntitiesSpy.mockResolvedValue(newsletters);

      const schema = z.object({
        newsletters: z.array(z.any()),
        pagination: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "newsletter" },
        schema,
        mockContext,
      );

      expect(result.newsletters[0].excerpt).toBeDefined();
      expect(result.newsletters[0].excerpt.length).toBeLessThanOrEqual(153); // 150 + "..."
    });

    it("should handle empty newsletter list", async () => {
      listEntitiesSpy.mockResolvedValue([]);

      const schema = z.object({
        newsletters: z.array(z.any()),
        pagination: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "newsletter" },
        schema,
        mockContext,
      );

      expect(result.newsletters).toHaveLength(0);
    });

    it("should respect limit parameter", async () => {
      const newsletters: Newsletter[] = [
        createMockNewsletter("nl-1", "Newsletter 1", "published"),
        createMockNewsletter("nl-2", "Newsletter 2", "published"),
      ];

      listEntitiesSpy.mockResolvedValue(newsletters);

      const schema = z.object({
        newsletters: z.array(z.any()),
        pagination: z.any().nullable(),
      });

      await datasource.fetch(
        { entityType: "newsletter", query: { limit: 2 } },
        schema,
        mockContext,
      );

      expect(mockEntityService.listEntities).toHaveBeenCalledWith(
        "newsletter",
        expect.objectContaining({ limit: 2 }),
      );
    });

    it("should filter by status when specified", async () => {
      const publishedNewsletters: Newsletter[] = [
        createMockNewsletter(
          "nl-1",
          "Sent Newsletter",
          "published",
          "Content",
          "2025-01-01T10:00:00.000Z",
        ),
      ];

      listEntitiesSpy.mockResolvedValue(publishedNewsletters);

      const schema = z.object({
        newsletters: z.array(z.any()),
        pagination: z.any().nullable(),
      });

      await datasource.fetch(
        { entityType: "newsletter", query: { status: "published" } },
        schema,
        mockContext,
      );

      expect(mockEntityService.listEntities).toHaveBeenCalledWith(
        "newsletter",
        expect.objectContaining({
          filter: { metadata: { status: "published" } },
        }),
      );
    });
  });

  describe("fetchSingleNewsletter", () => {
    it("should fetch a single newsletter by ID", async () => {
      const newsletter = createMockNewsletter(
        "nl-1",
        "My Newsletter",
        "published",
        "Full newsletter content here",
        "2025-01-01T10:00:00.000Z",
      );

      getEntitySpy.mockResolvedValueOnce(newsletter);
      listEntitiesSpy.mockResolvedValueOnce([]); // For navigation

      const schema = z.object({
        id: z.string(),
        subject: z.string(),
        status: z.string(),
        content: z.string(),
        prevNewsletter: z.any().nullable(),
        nextNewsletter: z.any().nullable(),
        sourceEntities: z.array(z.any()).optional(),
      });

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-1" } },
        schema,
        mockContext,
      );

      expect(result.id).toBe("nl-1");
      expect(result.subject).toBe("My Newsletter");
      expect(result.content).toBe("Full newsletter content here");
    });

    it("should throw error when newsletter not found", async () => {
      getEntitySpy.mockResolvedValue(null);

      const schema = z.object({
        id: z.string(),
        subject: z.string(),
        prevNewsletter: z.any().nullable(),
        nextNewsletter: z.any().nullable(),
      });

      expect(
        datasource.fetch(
          { entityType: "newsletter", query: { id: "nonexistent" } },
          schema,
          mockContext,
        ),
      ).rejects.toThrow("Newsletter not found: nonexistent");
    });

    it("should include prev/next navigation", async () => {
      const targetNewsletter = createMockNewsletter(
        "nl-2",
        "Middle Newsletter",
        "published",
        "Content",
        "2025-01-02T10:00:00.000Z",
      );

      const allNewsletters: Newsletter[] = [
        createMockNewsletter(
          "nl-3",
          "Newest",
          "published",
          "Content",
          "2025-01-03T10:00:00.000Z",
        ),
        targetNewsletter,
        createMockNewsletter(
          "nl-1",
          "Oldest",
          "published",
          "Content",
          "2025-01-01T10:00:00.000Z",
        ),
      ];

      getEntitySpy.mockResolvedValueOnce(targetNewsletter);
      listEntitiesSpy.mockResolvedValueOnce(allNewsletters);

      const schema = z.object({
        id: z.string(),
        subject: z.string(),
        prevNewsletter: z.any().nullable(),
        nextNewsletter: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-2" } },
        schema,
        mockContext,
      );

      expect(result.id).toBe("nl-2");
      expect(result.prevNewsletter?.id).toBe("nl-3"); // Newer
      expect(result.nextNewsletter?.id).toBe("nl-1"); // Older
    });

    it("should handle first newsletter (no prev)", async () => {
      const targetNewsletter = createMockNewsletter(
        "nl-1",
        "First Newsletter",
        "published",
        "Content",
        "2025-01-03T10:00:00.000Z",
      );

      const allNewsletters: Newsletter[] = [
        targetNewsletter,
        createMockNewsletter(
          "nl-2",
          "Older",
          "published",
          "Content",
          "2025-01-01T10:00:00.000Z",
        ),
      ];

      getEntitySpy.mockResolvedValueOnce(targetNewsletter);
      listEntitiesSpy.mockResolvedValueOnce(allNewsletters);

      const schema = z.object({
        id: z.string(),
        subject: z.string(),
        prevNewsletter: z.any().nullable(),
        nextNewsletter: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-1" } },
        schema,
        mockContext,
      );

      expect(result.prevNewsletter).toBeNull();
      expect(result.nextNewsletter?.id).toBe("nl-2");
    });

    it("should handle last newsletter (no next)", async () => {
      const targetNewsletter = createMockNewsletter(
        "nl-2",
        "Last Newsletter",
        "published",
        "Content",
        "2025-01-01T10:00:00.000Z",
      );

      const allNewsletters: Newsletter[] = [
        createMockNewsletter(
          "nl-1",
          "Newer",
          "published",
          "Content",
          "2025-01-03T10:00:00.000Z",
        ),
        targetNewsletter,
      ];

      getEntitySpy.mockResolvedValueOnce(targetNewsletter);
      listEntitiesSpy.mockResolvedValueOnce(allNewsletters);

      const schema = z.object({
        id: z.string(),
        subject: z.string(),
        prevNewsletter: z.any().nullable(),
        nextNewsletter: z.any().nullable(),
      });

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-2" } },
        schema,
        mockContext,
      );

      expect(result.prevNewsletter?.id).toBe("nl-1");
      expect(result.nextNewsletter).toBeNull();
    });
  });

  describe("sourceEntities", () => {
    it("should resolve source entities when entityIds are prepublished", async () => {
      const newsletter = createMockNewsletter(
        "nl-1",
        "Newsletter with sources",
        "published",
        "Content",
        "2025-01-01T10:00:00.000Z",
        ["post-1", "post-2"],
      );

      const mockPost1 = createTestEntity("post", {
        id: "post-1",
        content: "Post content",
        metadata: { title: "Blog Post 1", slug: "blog-post-1" },
      });
      const mockPost2 = createTestEntity("post", {
        id: "post-2",
        content: "Post content",
        metadata: { title: "Blog Post 2", slug: "blog-post-2" },
      });

      // First call: fetch newsletter, then fetch source entities
      getEntitySpy
        .mockResolvedValueOnce(newsletter) // Newsletter fetch
        .mockResolvedValueOnce(mockPost1) // Source entity 1
        .mockResolvedValueOnce(mockPost2); // Source entity 2

      listEntitiesSpy.mockResolvedValueOnce([]); // For navigation

      const schema = z.object({
        id: z.string(),
        subject: z.string(),
        prevNewsletter: z.any().nullable(),
        nextNewsletter: z.any().nullable(),
        sourceEntities: z.array(z.any()).optional(),
      });

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-1" } },
        schema,
        mockContext,
      );

      expect(result.sourceEntities).toBeDefined();
      expect(result.sourceEntities).toHaveLength(2);
      expect(result.sourceEntities?.[0].id).toBe("post-1");
      expect(result.sourceEntities?.[0].title).toBe("Blog Post 1");
      expect(result.sourceEntities?.[1].id).toBe("post-2");
    });

    it("should use sourceEntityType from metadata when present", async () => {
      const newsletter = createTestEntity<Newsletter>("newsletter", {
        id: "nl-1",
        content: "Content",
        metadata: {
          subject: "Newsletter with deck sources",
          status: "published",
          sentAt: "2025-01-01T10:00:00.000Z",
          entityIds: ["deck-1"],
          sourceEntityType: "deck",
        },
      });

      const mockDeck = createTestEntity("deck", {
        id: "deck-1",
        content: "Deck content",
        metadata: { title: "My Deck", slug: "my-deck" },
      });

      getEntitySpy
        .mockResolvedValueOnce(newsletter) // Newsletter fetch
        .mockResolvedValueOnce(mockDeck); // Source entity

      listEntitiesSpy.mockResolvedValueOnce([]); // For navigation

      const schema = z.object({
        id: z.string(),
        subject: z.string(),
        prevNewsletter: z.any().nullable(),
        nextNewsletter: z.any().nullable(),
        sourceEntities: z.array(z.any()).optional(),
      });

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-1" } },
        schema,
        mockContext,
      );

      // Should have fetched as "deck" type, not "post"
      expect(getEntitySpy).toHaveBeenCalledWith("deck", "deck-1");
      expect(result.sourceEntities).toHaveLength(1);
      expect(result.sourceEntities?.[0].title).toBe("My Deck");
      expect(result.sourceEntities?.[0].url).toBe("/decks/my-deck");
    });

    it("should default to 'post' when sourceEntityType is not set", async () => {
      const newsletter = createMockNewsletter(
        "nl-1",
        "Newsletter",
        "published",
        "Content",
        "2025-01-01T10:00:00.000Z",
        ["post-1"],
      );

      const mockPost = createTestEntity("post", {
        id: "post-1",
        content: "Post content",
        metadata: { title: "Blog Post", slug: "blog-post" },
      });

      getEntitySpy
        .mockResolvedValueOnce(newsletter)
        .mockResolvedValueOnce(mockPost);

      listEntitiesSpy.mockResolvedValueOnce([]);

      const schema = z.object({
        id: z.string(),
        subject: z.string(),
        prevNewsletter: z.any().nullable(),
        nextNewsletter: z.any().nullable(),
        sourceEntities: z.array(z.any()).optional(),
      });

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-1" } },
        schema,
        mockContext,
      );

      // Should have fetched as "post" (default)
      expect(getEntitySpy).toHaveBeenCalledWith("post", "post-1");
      expect(result.sourceEntities?.[0].url).toBe("/posts/blog-post");
    });

    it("should handle missing source entities gracefully", async () => {
      const newsletter = createMockNewsletter(
        "nl-1",
        "Newsletter",
        "published",
        "Content",
        "2025-01-01T10:00:00.000Z",
        ["post-1", "nonexistent"],
      );

      const mockPost1 = createTestEntity("post", {
        id: "post-1",
        content: "Post content",
        metadata: { title: "Blog Post 1", slug: "blog-post-1" },
      });

      // First call: fetch newsletter, then fetch source entities
      getEntitySpy
        .mockResolvedValueOnce(newsletter) // Newsletter fetch
        .mockResolvedValueOnce(mockPost1) // Source entity 1
        .mockResolvedValueOnce(null); // Nonexistent post

      listEntitiesSpy.mockResolvedValueOnce([]); // For navigation

      const schema = z.object({
        id: z.string(),
        subject: z.string(),
        prevNewsletter: z.any().nullable(),
        nextNewsletter: z.any().nullable(),
        sourceEntities: z.array(z.any()).optional(),
      });

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-1" } },
        schema,
        mockContext,
      );

      expect(result.sourceEntities).toBeDefined();
      expect(result.sourceEntities).toHaveLength(1);
      expect(result.sourceEntities?.[0].id).toBe("post-1");
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
      newsletters: z.array(z.any()),
      pagination: paginationSchema.nullable(),
    });

    it("should return paginated newsletters when page is specified", async () => {
      const newsletters: Newsletter[] = [
        createMockNewsletter("nl-1", "Newsletter 1", "published"),
        createMockNewsletter("nl-2", "Newsletter 2", "published"),
        createMockNewsletter("nl-3", "Newsletter 3", "published"),
      ];

      listEntitiesSpy.mockResolvedValue(newsletters);
      spyOn(mockEntityService, "countEntities").mockResolvedValue(10);

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { page: 1, pageSize: 3 } },
        paginatedListSchema,
        mockContext,
      );

      expect(result.newsletters).toHaveLength(3);
      expect(result.pagination).not.toBeNull();
      expect(result.pagination?.currentPage).toBe(1);
      expect(result.pagination?.totalPages).toBe(4);
      expect(result.pagination?.totalItems).toBe(10);
      expect(result.pagination?.hasNextPage).toBe(true);
      expect(result.pagination?.hasPrevPage).toBe(false);
    });

    it("should return null pagination when page is not specified", async () => {
      const newsletters: Newsletter[] = [
        createMockNewsletter("nl-1", "Newsletter 1", "published"),
      ];

      listEntitiesSpy.mockResolvedValue(newsletters);

      const result = await datasource.fetch(
        { entityType: "newsletter" },
        paginatedListSchema,
        mockContext,
      );

      expect(result.pagination).toBeNull();
    });
  });
});
