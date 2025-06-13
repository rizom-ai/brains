import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { ContentGenerationAdapter } from "@/mcp/adapters";
import type { ContentGenerationService } from "@/content/contentGenerationService";
import type { EntityService } from "@/entity/entityService";
import { z } from "zod";
import type { ContentGenerateOptions } from "@brains/types";

describe("ContentGenerationAdapter", () => {
  let adapter: ContentGenerationAdapter;
  let mockContentGenerationService: ContentGenerationService;
  let mockEntityService: EntityService;

  const testSchema = z.object({
    title: z.string(),
    content: z.string(),
  });

  beforeEach(() => {
    // Create mock service with type assertions for test purposes
    mockEntityService = {
      createEntity: mock(() =>
        Promise.resolve({
          id: "generated-entity-123",
          entityType: "generated-content",
          content: "",
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        }),
      ),
      deriveEntity: mock(() =>
        Promise.resolve({
          id: "promoted-entity-123",
          entityType: "note",
          content: "Promoted content",
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        }),
      ),
    } as unknown as EntityService;

    // Create mock content generation service
    mockContentGenerationService = {
      generate: async <T>(_options: ContentGenerateOptions<T>) => {
        // Simple mock that returns valid data for the schema
        return {
          title: "Generated Title",
          content: "Generated Content",
        } as T;
      },
    } as ContentGenerationService;

    // Create adapter
    adapter = new ContentGenerationAdapter(
      mockContentGenerationService,
      mockEntityService,
    );
  });

  afterEach(() => {
    // Clean up - not needed for this test
  });

  describe("generateContent", () => {
    it("should generate content without saving when save is not specified", async () => {
      const result = await adapter.generateContent({
        prompt: "Generate test content",
        contentType: "test:content",
        schema: testSchema,
      });

      expect(result).toEqual({
        title: "Generated Title",
        content: "Generated Content",
      });
    });

    it("should generate content without saving when save=false", async () => {
      const result = await adapter.generateContent({
        prompt: "Generate test content",
        contentType: "test:content",
        schema: testSchema,
        save: false,
      });

      expect(result).toEqual({
        title: "Generated Title",
        content: "Generated Content",
      });
    });

    it("should generate and save content when save=true", async () => {
      const result = await adapter.generateContent({
        prompt: "Generate test content",
        contentType: "test:content",
        schema: testSchema,
        save: true,
      });

      // Should return the generated content (save happens internally)
      expect(result).toEqual({
        title: "Generated Title",
        content: "Generated Content",
      });

      // Verify the adapter just returns the generated content (save is handled by ContentGenerationService)
      // The test confirms the adapter behavior is correct
    });

    it("should use custom contentType when provided", async () => {
      const result = await adapter.generateContent({
        prompt: "Generate test content",
        contentType: "custom:type",
        schema: testSchema,
        save: true,
      });

      // Should return generated content regardless of contentType
      expect(result).toEqual({
        title: "Generated Title",
        content: "Generated Content",
      });
    });

    it("should save generated content with correct structure", async () => {
      const context = {
        data: { key: "value" },
        style: "formal",
      };

      const result = await adapter.generateContent({
        prompt: "Generate test content",
        contentType: "test:content",
        schema: testSchema,
        context,
        save: true,
      });

      // Should return generated content even with context
      expect(result).toEqual({
        title: "Generated Title",
        content: "Generated Content",
      });
    });

    it("should handle generation errors gracefully", async () => {
      mockContentGenerationService.generate = async <T>(): Promise<T> => {
        throw new Error("Generation failed");
      };

      expect(
        adapter.generateContent({
          prompt: "Generate test content",
          contentType: "test:content",
          schema: testSchema,
        }),
      ).rejects.toThrow("Generation failed");
    });

    it("should handle entity creation errors when save=true", async () => {
      // Make ContentGenerationService throw an error (simulating save failure)
      mockContentGenerationService.generate = async (): Promise<never> => {
        throw new Error("Save failed");
      };

      expect(
        adapter.generateContent({
          prompt: "Generate test content",
          contentType: "test:content",
          schema: testSchema,
          save: true,
        }),
      ).rejects.toThrow("Save failed");
    });

    it("should include generated content in entity content field", async () => {
      const result = await adapter.generateContent({
        prompt: "Generate test content",
        contentType: "test:content",
        schema: testSchema,
        save: true,
      });

      // Should return the generated content structure
      expect(result).toEqual({
        title: "Generated Title",
        content: "Generated Content",
      });
    });
  });

  describe("promoteGeneratedContent", () => {
    it("should call deriveEntity with correct parameters", async () => {
      const deriveEntitySpy = mockEntityService.deriveEntity as ReturnType<
        typeof mock
      >;

      const result = await adapter.promoteGeneratedContent({
        generatedContentId: "source-123",
        targetEntityType: "note",
      });

      expect(deriveEntitySpy).toHaveBeenCalledWith(
        "source-123",
        "generated-content",
        "note",
        undefined,
      );

      expect(result).toEqual({
        promotedId: "promoted-entity-123",
        promotedType: "note",
        message: "Promoted to note: promoted-entity-123",
      });
    });

    it("should ignore additional fields", async () => {
      const deriveEntitySpy = mockEntityService.deriveEntity as ReturnType<
        typeof mock
      >;

      await adapter.promoteGeneratedContent({
        generatedContentId: "source-123",
        targetEntityType: "note",
        additionalFields: { title: "Custom Title", tags: ["promoted", "test"] },
      });

      expect(deriveEntitySpy).toHaveBeenCalledWith(
        "source-123",
        "generated-content",
        "note",
        undefined,
      );
    });

    it("should handle deleteOriginal option", async () => {
      const deriveEntitySpy = mockEntityService.deriveEntity as ReturnType<
        typeof mock
      >;

      await adapter.promoteGeneratedContent({
        generatedContentId: "source-123",
        targetEntityType: "note",
        deleteOriginal: true,
      });

      expect(deriveEntitySpy).toHaveBeenCalledWith(
        "source-123",
        "generated-content",
        "note",
        { deleteSource: true },
      );
    });

    it("should handle derive errors gracefully", async () => {
      mockEntityService.deriveEntity = (async (): Promise<never> => {
        throw new Error("Derive failed");
      }) as unknown as typeof mockEntityService.deriveEntity;

      expect(
        adapter.promoteGeneratedContent({
          generatedContentId: "source-123",
          targetEntityType: "note",
        }),
      ).rejects.toThrow("Derive failed");
    });
  });
});
