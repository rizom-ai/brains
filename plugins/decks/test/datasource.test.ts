import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { DeckDataSource } from "../src/datasources/deck-datasource";
import type { DeckEntity } from "../src/schemas/deck";
import type { IEntityService, BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import {
  createMockLogger,
  createMockEntityService,
  createTestEntity,
} from "@brains/test-utils";

describe("DeckDataSource", () => {
  let datasource: DeckDataSource;
  let mockEntityService: IEntityService;
  let mockLogger: Logger;
  let mockContext: BaseDataSourceContext;

  const createMockDeck = (
    id: string,
    title: string,
    slug: string,
    status: "draft" | "published",
    publishedAt?: string,
  ): DeckEntity => {
    const content = `# ${title}\n\n---\n\n# Slide 2`;
    return createTestEntity<DeckEntity>("deck", {
      id,
      content,
      title,
      status,
      publishedAt,
      metadata: {
        title,
        slug,
        status,
        publishedAt,
      },
    });
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockEntityService = createMockEntityService();
    mockContext = { entityService: mockEntityService };

    datasource = new DeckDataSource(mockLogger);
  });

  describe("fetchDeckList", () => {
    const listSchema = z.object({
      decks: z.array(z.any()),
    });

    it("should return decks from entityService", async () => {
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

      spyOn(mockEntityService, "listEntities").mockResolvedValue(
        publishedDecks,
      );

      const result = await datasource.fetch(
        { entityType: "deck" },
        listSchema,
        mockContext,
      );

      expect(result.decks).toHaveLength(2);
      expect(
        result.decks.every((d: DeckEntity) => d.status === "published"),
      ).toBe(true);
    });

    it("should include both published and draft decks when entityService returns all", async () => {
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

      spyOn(mockEntityService, "listEntities").mockResolvedValue(decks);

      const result = await datasource.fetch(
        { entityType: "deck" },
        listSchema,
        mockContext,
      );

      expect(result.decks).toHaveLength(3);
      const statuses = result.decks.map((d: DeckEntity) => d.status);
      expect(statuses).toContain("published");
      expect(statuses).toContain("draft");
    });

    it("should request DB-level sorting by publishedAt desc", async () => {
      spyOn(mockEntityService, "listEntities").mockResolvedValue([]);

      await datasource.fetch({ entityType: "deck" }, listSchema, mockContext);

      expect(mockEntityService.listEntities).toHaveBeenCalledWith(
        "deck",
        expect.objectContaining({
          sortFields: [{ field: "publishedAt", direction: "desc" }],
        }),
      );
    });

    it("should handle empty deck list", async () => {
      spyOn(mockEntityService, "listEntities").mockResolvedValue([]);

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

      spyOn(mockEntityService, "listEntities").mockResolvedValue([deck]);

      const result = await datasource.fetch(
        { entityType: "deck", query: { id: "test-deck" } },
        detailSchema,
        mockContext,
      );

      expect(result.markdown).toBe(deck.content);
    });

    it("should throw error when deck not found", async () => {
      spyOn(mockEntityService, "listEntities").mockResolvedValue([]);

      expect(
        datasource.fetch(
          { entityType: "deck", query: { id: "nonexistent-slug" } },
          detailSchema,
          mockContext,
        ),
      ).rejects.toThrow("not found with slug: nonexistent-slug");
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
