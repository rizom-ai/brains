import type { mock } from "bun:test";
import { describe, it, expect, beforeEach } from "bun:test";
import { DeckDataSource } from "../src/datasources/deck-datasource";
import type { DeckEntity } from "../src/schemas/deck";
import type { IEntityService, Logger } from "@brains/plugins";
import type { BaseDataSourceContext } from "@brains/datasource";
import { z, computeContentHash } from "@brains/utils";
import { createMockLogger, createMockEntityService } from "@brains/test-utils";

describe("DeckDataSource", () => {
  let datasource: DeckDataSource;
  let mockEntityService: IEntityService;
  let mockLogger: Logger;
  let mockContext: BaseDataSourceContext;

  // Helper to create mock deck entities
  const createMockDeck = (
    id: string,
    title: string,
    slug: string,
    status: "draft" | "published",
    publishedAt?: string,
  ): DeckEntity => {
    const content = `# ${title}\n\n---\n\n# Slide 2`;
    return {
      id,
      entityType: "deck",
      content,
      contentHash: computeContentHash(content),
      title,
      status,
      created: "2025-01-01T10:00:00.000Z",
      updated: "2025-01-01T10:00:00.000Z",
      publishedAt,
      metadata: {
        title,
        slug,
        status,
        publishedAt,
      },
    };
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockEntityService = createMockEntityService();
    mockContext = {};

    datasource = new DeckDataSource(mockEntityService, mockLogger);
  });

  describe("fetchDeckList", () => {
    const listSchema = z.object({
      decks: z.array(z.any()),
    });

    it("should show only published decks when publishedOnly is true", async () => {
      // When publishedOnly is true, entity service filters at database level
      // Mock returns only published decks (simulating entity service filtering)
      const publishedDecks: DeckEntity[] = [
        createMockDeck(
          "deck-1",
          "Published Deck",
          "published-deck",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockDeck(
          "deck-3",
          "Another Published",
          "another-published",
          "published",
          "2025-01-02T10:00:00.000Z",
        ),
      ];

      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(publishedDecks);

      const result = await datasource.fetch(
        { entityType: "deck" },
        listSchema,
        { ...mockContext, publishedOnly: true },
      );

      expect(result.decks).toHaveLength(2);
      expect(
        result.decks.every((d: DeckEntity) => d.status === "published"),
      ).toBe(true);

      // Verify publishedOnly was passed to entity service
      expect(mockEntityService.listEntities).toHaveBeenCalledWith("deck", {
        limit: 100,
        publishedOnly: true,
      });
    });

    it("should show all decks (including drafts) when publishedOnly is false", async () => {
      // When publishedOnly is false, entity service returns all decks
      const decks: DeckEntity[] = [
        createMockDeck(
          "deck-1",
          "Published Deck",
          "published-deck",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockDeck("deck-2", "Draft Deck", "draft-deck", "draft"),
        createMockDeck("deck-3", "Another Draft", "another-draft", "draft"),
      ];

      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(decks);

      const result = await datasource.fetch(
        { entityType: "deck" },
        listSchema,
        { ...mockContext, publishedOnly: false },
      );

      expect(result.decks).toHaveLength(3);
      // Verify we have both published and draft decks
      const statuses = result.decks.map((d: DeckEntity) => d.status);
      expect(statuses).toContain("published");
      expect(statuses).toContain("draft");

      // Verify publishedOnly: false was passed to entity service
      expect(mockEntityService.listEntities).toHaveBeenCalledWith("deck", {
        limit: 100,
        publishedOnly: false,
      });
    });

    it("should sort decks by publishedAt date, newest first", async () => {
      const decks: DeckEntity[] = [
        createMockDeck(
          "deck-1",
          "Oldest",
          "oldest",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockDeck(
          "deck-2",
          "Newest",
          "newest",
          "published",
          "2025-01-03T10:00:00.000Z",
        ),
        createMockDeck(
          "deck-3",
          "Middle",
          "middle",
          "published",
          "2025-01-02T10:00:00.000Z",
        ),
      ];

      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(decks);

      const result = await datasource.fetch(
        { entityType: "deck" },
        listSchema,
        { ...mockContext, publishedOnly: true },
      );

      expect(result.decks).toHaveLength(3);
      expect(result.decks[0].id).toBe("deck-2"); // Newest first
      expect(result.decks[1].id).toBe("deck-3");
      expect(result.decks[2].id).toBe("deck-1"); // Oldest last
    });

    it("should handle empty deck list", async () => {
      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue([]);

      const result = await datasource.fetch(
        { entityType: "deck" },
        listSchema,
        mockContext,
      );

      expect(result.decks).toHaveLength(0);
    });
  });

  describe("fetchSingleDeck", () => {
    const detailSchema = z.object({
      markdown: z.string(),
    });

    it("should fetch a single deck by slug", async () => {
      const deck = createMockDeck(
        "deck-1",
        "Test Deck",
        "test-deck",
        "published",
        "2025-01-01T10:00:00.000Z",
      );

      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue([deck]);

      const result = await datasource.fetch(
        { entityType: "deck", query: { id: "test-deck" } },
        detailSchema,
        mockContext,
      );

      expect(result.markdown).toBe(deck.content);
    });

    it("should throw error when deck not found", async () => {
      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue([]);

      expect(
        datasource.fetch(
          { entityType: "deck", query: { id: "nonexistent-slug" } },
          detailSchema,
          mockContext,
        ),
      ).rejects.toThrow("Deck not found with slug: nonexistent-slug");
    });
  });

  describe("metadata", () => {
    it("should have correct datasource ID", () => {
      expect(datasource.id).toBe("decks:entities");
    });

    it("should have descriptive name and description", () => {
      expect(datasource.name).toBe("Deck Entity DataSource");
      expect(datasource.description).toContain("deck entities");
    });
  });
});
