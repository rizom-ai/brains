import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { NewsletterDataSource } from "../src/datasources/newsletter-datasource";
import { newsletterDetailSchema } from "../src/templates/newsletter-detail";
import { newsletterListSchema } from "../src/templates/newsletter-list";
import type { Newsletter } from "../src/schemas/newsletter";
import type { IEntityService, BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
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

      spyOn(mockEntityService, "listEntities").mockResolvedValue(newsletters);

      const schema = newsletterListSchema;

      const result = await datasource.fetch(
        { entityType: "newsletter" },
        schema,
        mockContext,
      );

      expect(result.newsletters).toEqual([
        expect.objectContaining({ id: "nl-1", subject: "First Newsletter" }),
        expect.any(Object),
      ]);
    });

    it("should enrich newsletters with excerpt from content", async () => {
      const longContent = "A".repeat(200);
      const newsletters: Newsletter[] = [
        createMockNewsletter("nl-1", "Test Newsletter", "draft", longContent),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(newsletters);

      const schema = newsletterListSchema;

      const result = await datasource.fetch(
        { entityType: "newsletter" },
        schema,
        mockContext,
      );

      const excerpt = result.newsletters[0]?.excerpt;
      expect(excerpt).toBeDefined();
      expect(excerpt?.length).toBeLessThanOrEqual(153); // 150 + "..."
    });

    it("should handle empty newsletter list", async () => {
      spyOn(mockEntityService, "listEntities").mockResolvedValue([]);

      const schema = newsletterListSchema;

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

      spyOn(mockEntityService, "listEntities").mockResolvedValue(newsletters);

      const schema = newsletterListSchema;

      await datasource.fetch(
        { entityType: "newsletter", query: { limit: 2 } },
        schema,
        mockContext,
      );

      expect(mockEntityService.listEntities).toHaveBeenCalledWith({
        entityType: "newsletter",
        options: expect.objectContaining({ limit: 2 }),
      });
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

      spyOn(mockEntityService, "listEntities").mockResolvedValue(
        publishedNewsletters,
      );

      const schema = newsletterListSchema;

      await datasource.fetch(
        { entityType: "newsletter", query: { status: "published" } },
        schema,
        mockContext,
      );

      expect(mockEntityService.listEntities).toHaveBeenCalledWith({
        entityType: "newsletter",
        options: expect.objectContaining({
          filter: { metadata: { status: "published" } },
        }),
      });
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

      spyOn(mockEntityService, "getEntity").mockResolvedValueOnce(newsletter);
      spyOn(mockEntityService, "listEntities").mockResolvedValueOnce([]); // For navigation

      const schema = newsletterDetailSchema;

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
      spyOn(mockEntityService, "getEntity").mockResolvedValue(null);

      const schema = newsletterDetailSchema;

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

      spyOn(mockEntityService, "getEntity").mockResolvedValueOnce(
        targetNewsletter,
      );
      spyOn(mockEntityService, "listEntities").mockResolvedValueOnce(
        allNewsletters,
      );

      const schema = newsletterDetailSchema;

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

      spyOn(mockEntityService, "getEntity").mockResolvedValueOnce(
        targetNewsletter,
      );
      spyOn(mockEntityService, "listEntities").mockResolvedValueOnce(
        allNewsletters,
      );

      const schema = newsletterDetailSchema;

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

      spyOn(mockEntityService, "getEntity").mockResolvedValueOnce(
        targetNewsletter,
      );
      spyOn(mockEntityService, "listEntities").mockResolvedValueOnce(
        allNewsletters,
      );

      const schema = newsletterDetailSchema;

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

      spyOn(mockEntityService, "getEntity")
        .mockResolvedValueOnce(newsletter)
        .mockResolvedValueOnce(mockPost1)
        .mockResolvedValueOnce(mockPost2);

      spyOn(mockEntityService, "listEntities").mockResolvedValueOnce([]); // For navigation

      const schema = newsletterDetailSchema;

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-1" } },
        schema,
        mockContext,
      );

      expect(result.sourceEntities).toEqual([
        expect.objectContaining({ id: "post-1", title: "Blog Post 1" }),
        expect.objectContaining({ id: "post-2" }),
      ]);
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

      spyOn(mockEntityService, "getEntity")
        .mockResolvedValueOnce(newsletter)
        .mockResolvedValueOnce(mockDeck);

      spyOn(mockEntityService, "listEntities").mockResolvedValueOnce([]); // For navigation

      const schema = newsletterDetailSchema;

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-1" } },
        schema,
        mockContext,
      );

      // Should have fetched as "deck" type, not "post"
      expect(mockEntityService.getEntity).toHaveBeenCalledWith({
        entityType: "deck",
        id: "deck-1",
      });
      expect(result.sourceEntities).toEqual([
        expect.objectContaining({ title: "My Deck", url: "/decks/my-deck" }),
      ]);
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

      spyOn(mockEntityService, "getEntity")
        .mockResolvedValueOnce(newsletter)
        .mockResolvedValueOnce(mockPost);

      spyOn(mockEntityService, "listEntities").mockResolvedValueOnce([]);

      const schema = newsletterDetailSchema;

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-1" } },
        schema,
        mockContext,
      );

      // Should have fetched as "post" (default)
      expect(mockEntityService.getEntity).toHaveBeenCalledWith({
        entityType: "post",
        id: "post-1",
      });
      expect(result.sourceEntities).toEqual([
        expect.objectContaining({ url: "/posts/blog-post" }),
      ]);
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

      spyOn(mockEntityService, "getEntity")
        .mockResolvedValueOnce(newsletter)
        .mockResolvedValueOnce(mockPost1)
        .mockResolvedValueOnce(null);

      spyOn(mockEntityService, "listEntities").mockResolvedValueOnce([]); // For navigation

      const schema = newsletterDetailSchema;

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-1" } },
        schema,
        mockContext,
      );

      expect(result.sourceEntities).toEqual([
        expect.objectContaining({ id: "post-1" }),
      ]);
    });
  });

  describe("pagination", () => {
    const paginatedListSchema = newsletterListSchema;

    it("should return paginated newsletters when page is specified", async () => {
      const newsletters: Newsletter[] = [
        createMockNewsletter("nl-1", "Newsletter 1", "published"),
        createMockNewsletter("nl-2", "Newsletter 2", "published"),
        createMockNewsletter("nl-3", "Newsletter 3", "published"),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(newsletters);
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

      spyOn(mockEntityService, "listEntities").mockResolvedValue(newsletters);

      const result = await datasource.fetch(
        { entityType: "newsletter" },
        paginatedListSchema,
        mockContext,
      );

      expect(result.pagination).toBeNull();
    });
  });
});
