import { createTestEntity } from "@brains/entity-service/test";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import { describe, it, expect, beforeEach } from "bun:test";
import { NewsletterDataSource } from "../src/entity/datasources/newsletter-datasource";
import { newsletterDetailSchema } from "../src/entity/templates/newsletter-detail";
import { newsletterListSchema } from "../src/entity/templates/newsletter-list";
import type { Newsletter } from "../src/entity/schemas/newsletter";
import type { BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { createMockLogger } from "@brains/test-utils";

describe("NewsletterDataSource", () => {
  let datasource: NewsletterDataSource;
  let shell: MockShell;
  let mockLogger: Logger;
  let mockContext: BaseDataSourceContext;

  // Helper to create mock newsletter. `created` drives list/navigation order.
  const createMockNewsletter = (
    id: string,
    subject: string,
    status: "draft" | "queued" | "published" | "failed",
    content: string = "Newsletter content",
    opts: {
      sentAt?: string;
      entityIds?: string[];
      created?: string;
    } = {},
  ): Newsletter => {
    return createTestEntity<Newsletter>("newsletter", {
      id,
      content,
      ...(opts.created && { created: opts.created, updated: opts.created }),
      metadata: {
        subject,
        status,
        ...(opts.sentAt && { sentAt: opts.sentAt }),
        ...(opts.entityIds && { entityIds: opts.entityIds }),
      },
    });
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    shell = createMockShell();
    mockContext = { entityService: shell.getEntityService() };

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
      shell.addEntities([
        createMockNewsletter(
          "nl-2",
          "Second Newsletter",
          "draft",
          "Content 2",
          {
            created: "2025-01-01T10:00:00.000Z",
          },
        ),
        createMockNewsletter(
          "nl-1",
          "First Newsletter",
          "published",
          "Content 1",
          {
            sentAt: "2025-01-02T10:00:00.000Z",
            created: "2025-01-02T10:00:00.000Z",
          },
        ),
      ]);

      const result = await datasource.fetch(
        { entityType: "newsletter" },
        newsletterListSchema,
        mockContext,
      );

      expect(result.newsletters).toEqual([
        expect.objectContaining({ id: "nl-1", subject: "First Newsletter" }),
        expect.objectContaining({ id: "nl-2" }),
      ]);
    });

    it("should enrich newsletters with excerpt from content", async () => {
      const longContent = "A".repeat(200);
      shell.addEntities([
        createMockNewsletter("nl-1", "Test Newsletter", "draft", longContent),
      ]);

      const result = await datasource.fetch(
        { entityType: "newsletter" },
        newsletterListSchema,
        mockContext,
      );

      const excerpt = result.newsletters[0]?.excerpt;
      expect(excerpt).toBeDefined();
      expect(excerpt?.length).toBeLessThanOrEqual(153); // 150 + "..."
    });

    it("should handle empty newsletter list", async () => {
      const result = await datasource.fetch(
        { entityType: "newsletter" },
        newsletterListSchema,
        mockContext,
      );

      expect(result.newsletters).toHaveLength(0);
    });

    it("should respect limit parameter", async () => {
      shell.addEntities([
        createMockNewsletter("nl-1", "Newsletter 1", "published", "Content", {
          created: "2025-01-01T10:00:00.000Z",
        }),
        createMockNewsletter("nl-2", "Newsletter 2", "published", "Content", {
          created: "2025-01-02T10:00:00.000Z",
        }),
        createMockNewsletter("nl-3", "Newsletter 3", "published", "Content", {
          created: "2025-01-03T10:00:00.000Z",
        }),
      ]);

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { limit: 2 } },
        newsletterListSchema,
        mockContext,
      );

      expect(result.newsletters.map((n) => n.id)).toEqual(["nl-3", "nl-2"]);
    });

    it("should filter by status when specified", async () => {
      shell.addEntities([
        createMockNewsletter(
          "nl-1",
          "Sent Newsletter",
          "published",
          "Content",
          {
            sentAt: "2025-01-01T10:00:00.000Z",
          },
        ),
        createMockNewsletter("nl-2", "Draft Newsletter", "draft"),
      ]);

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { status: "published" } },
        newsletterListSchema,
        mockContext,
      );

      expect(result.newsletters.map((n) => n.id)).toEqual(["nl-1"]);
    });
  });

  describe("fetchSingleNewsletter", () => {
    it("should fetch a single newsletter by ID", async () => {
      shell.addEntities([
        createMockNewsletter(
          "nl-1",
          "My Newsletter",
          "published",
          "Full newsletter content here",
          { sentAt: "2025-01-01T10:00:00.000Z" },
        ),
      ]);

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-1" } },
        newsletterDetailSchema,
        mockContext,
      );

      expect(result.id).toBe("nl-1");
      expect(result.subject).toBe("My Newsletter");
      expect(result.content).toBe("Full newsletter content here");
    });

    it("normalizes absent draft detail fields to JSON nulls", async () => {
      shell.addEntities([
        createMockNewsletter("draft-1", "Draft newsletter", "draft"),
      ]);

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "draft-1" } },
        newsletterDetailSchema,
        mockContext,
      );

      expect(result.sentAt).toBeNull();
      expect(result.scheduledFor).toBeNull();
      expect(result.sourceEntities).toBeNull();
    });

    it("should throw error when newsletter not found", async () => {
      expect(
        datasource.fetch(
          { entityType: "newsletter", query: { id: "nonexistent" } },
          newsletterDetailSchema,
          mockContext,
        ),
      ).rejects.toThrow("Newsletter not found: nonexistent");
    });

    it("should include prev/next navigation", async () => {
      shell.addEntities([
        createMockNewsletter("nl-1", "Oldest", "published", "Content", {
          created: "2025-01-01T10:00:00.000Z",
        }),
        createMockNewsletter(
          "nl-2",
          "Middle Newsletter",
          "published",
          "Content",
          {
            created: "2025-01-02T10:00:00.000Z",
          },
        ),
        createMockNewsletter("nl-3", "Newest", "published", "Content", {
          created: "2025-01-03T10:00:00.000Z",
        }),
      ]);

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-2" } },
        newsletterDetailSchema,
        mockContext,
      );

      expect(result.id).toBe("nl-2");
      expect(result.prevNewsletter?.id).toBe("nl-3"); // Newer
      expect(result.nextNewsletter?.id).toBe("nl-1"); // Older
    });

    it("should handle first newsletter (no prev)", async () => {
      shell.addEntities([
        createMockNewsletter(
          "nl-1",
          "First Newsletter",
          "published",
          "Content",
          {
            created: "2025-01-03T10:00:00.000Z",
          },
        ),
        createMockNewsletter("nl-2", "Older", "published", "Content", {
          created: "2025-01-01T10:00:00.000Z",
        }),
      ]);

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-1" } },
        newsletterDetailSchema,
        mockContext,
      );

      expect(result.prevNewsletter).toBeNull();
      expect(result.nextNewsletter?.id).toBe("nl-2");
    });

    it("should handle last newsletter (no next)", async () => {
      shell.addEntities([
        createMockNewsletter("nl-1", "Newer", "published", "Content", {
          created: "2025-01-03T10:00:00.000Z",
        }),
        createMockNewsletter(
          "nl-2",
          "Last Newsletter",
          "published",
          "Content",
          {
            created: "2025-01-01T10:00:00.000Z",
          },
        ),
      ]);

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-2" } },
        newsletterDetailSchema,
        mockContext,
      );

      expect(result.prevNewsletter?.id).toBe("nl-1");
      expect(result.nextNewsletter).toBeNull();
    });
  });

  describe("sourceEntities", () => {
    it("should resolve source entities when entityIds are prepublished", async () => {
      shell.addEntities([
        createMockNewsletter(
          "nl-1",
          "Newsletter with sources",
          "published",
          "Content",
          {
            sentAt: "2025-01-01T10:00:00.000Z",
            entityIds: ["post-1", "post-2"],
          },
        ),
        createTestEntity("post", {
          id: "post-1",
          content: "Post content",
          metadata: { title: "Blog Post 1", slug: "blog-post-1" },
        }),
        createTestEntity("post", {
          id: "post-2",
          content: "Post content",
          metadata: { title: "Blog Post 2", slug: "blog-post-2" },
        }),
      ]);

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-1" } },
        newsletterDetailSchema,
        mockContext,
      );

      expect(result.sourceEntities).toEqual([
        expect.objectContaining({ id: "post-1", title: "Blog Post 1" }),
        expect.objectContaining({ id: "post-2" }),
      ]);
    });

    it("should use sourceEntityType from metadata when present", async () => {
      shell.addEntities([
        createTestEntity<Newsletter>("newsletter", {
          id: "nl-1",
          content: "Content",
          metadata: {
            subject: "Newsletter with deck sources",
            status: "published",
            sentAt: "2025-01-01T10:00:00.000Z",
            entityIds: ["deck-1"],
            sourceEntityType: "deck",
          },
        }),
        createTestEntity("deck", {
          id: "deck-1",
          content: "Deck content",
          metadata: { title: "My Deck", slug: "my-deck" },
        }),
      ]);

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-1" } },
        newsletterDetailSchema,
        mockContext,
      );

      // Resolved from the seeded deck entity, not the "post" default.
      expect(result.sourceEntities).toEqual([
        expect.objectContaining({ title: "My Deck", url: "/decks/my-deck" }),
      ]);
    });

    it("should default to 'post' when sourceEntityType is not set", async () => {
      shell.addEntities([
        createMockNewsletter("nl-1", "Newsletter", "published", "Content", {
          sentAt: "2025-01-01T10:00:00.000Z",
          entityIds: ["post-1"],
        }),
        createTestEntity("post", {
          id: "post-1",
          content: "Post content",
          metadata: { title: "Blog Post", slug: "blog-post" },
        }),
      ]);

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-1" } },
        newsletterDetailSchema,
        mockContext,
      );

      expect(result.sourceEntities).toEqual([
        expect.objectContaining({ url: "/posts/blog-post" }),
      ]);
    });

    it("should handle missing source entities gracefully", async () => {
      shell.addEntities([
        createMockNewsletter("nl-1", "Newsletter", "published", "Content", {
          sentAt: "2025-01-01T10:00:00.000Z",
          entityIds: ["post-1", "nonexistent"],
        }),
        createTestEntity("post", {
          id: "post-1",
          content: "Post content",
          metadata: { title: "Blog Post 1", slug: "blog-post-1" },
        }),
      ]);

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { id: "nl-1" } },
        newsletterDetailSchema,
        mockContext,
      );

      expect(result.sourceEntities).toEqual([
        expect.objectContaining({ id: "post-1" }),
      ]);
    });
  });

  describe("pagination", () => {
    it("should return paginated newsletters when page is specified", async () => {
      shell.addEntities(
        Array.from({ length: 10 }, (_, i) =>
          createMockNewsletter(
            `nl-${i + 1}`,
            `Newsletter ${i + 1}`,
            "published",
            "Content",
            {
              created: `2025-01-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
            },
          ),
        ),
      );

      const result = await datasource.fetch(
        { entityType: "newsletter", query: { page: 1, pageSize: 3 } },
        newsletterListSchema,
        mockContext,
      );

      expect(result.newsletters.map((n) => n.id)).toEqual([
        "nl-10",
        "nl-9",
        "nl-8",
      ]);
      expect(result.pagination).not.toBeNull();
      expect(result.pagination?.currentPage).toBe(1);
      expect(result.pagination?.totalPages).toBe(4);
      expect(result.pagination?.totalItems).toBe(10);
      expect(result.pagination?.hasNextPage).toBe(true);
      expect(result.pagination?.hasPrevPage).toBe(false);
    });

    it("should return null pagination when page is not specified", async () => {
      shell.addEntities([
        createMockNewsletter("nl-1", "Newsletter 1", "published"),
      ]);

      const result = await datasource.fetch(
        { entityType: "newsletter" },
        newsletterListSchema,
        mockContext,
      );

      expect(result.pagination).toBeNull();
    });
  });
});
