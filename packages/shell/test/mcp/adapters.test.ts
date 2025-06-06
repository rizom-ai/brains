import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { ContentGenerationAdapter } from "@/mcp/adapters";
import type { ContentGenerationService } from "@/content/contentGenerationService";
import type { EntityService } from "@/entity/entityService";
import type { SchemaRegistry } from "@/schema/schemaRegistry";
import { z } from "zod";
import type { ContentGenerateOptions } from "@brains/types";

describe("ContentGenerationAdapter", () => {
  let adapter: ContentGenerationAdapter;
  let mockContentGenerationService: ContentGenerationService;
  let mockEntityService: EntityService;
  let mockSchemaRegistry: SchemaRegistry;

  const testSchema = z.object({
    title: z.string(),
    content: z.string(),
  });

  beforeEach(() => {
    // Create mock services
    mockContentGenerationService = {
      generate: async <T>(_options: ContentGenerateOptions<T>) => {
        // Simple mock that returns valid data for the schema
        return {
          title: "Generated Title",
          content: "Generated Content",
        } as T;
      },
    } as ContentGenerationService;

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

    mockSchemaRegistry = {
      get: (schemaName: string): z.ZodType<unknown> | null => {
        if (schemaName === "testSchema") {
          return testSchema;
        }
        return null;
      },
    } as unknown as SchemaRegistry;

    // Create adapter
    adapter = new ContentGenerationAdapter(
      mockContentGenerationService,
      mockSchemaRegistry,
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
        schemaName: "testSchema",
      });

      expect(result).toEqual({
        title: "Generated Title",
        content: "Generated Content",
      });
    });

    it("should generate content without saving when save=false", async () => {
      const result = await adapter.generateContent({
        prompt: "Generate test content",
        schemaName: "testSchema",
        save: false,
      });

      expect(result).toEqual({
        title: "Generated Title",
        content: "Generated Content",
      });
    });

    it("should generate and save content when save=true", async () => {
      const createEntitySpy = mockEntityService.createEntity as ReturnType<
        typeof mock
      >;

      const result = await adapter.generateContent({
        prompt: "Generate test content",
        schemaName: "testSchema",
        save: true,
      });

      // Should return entity info instead of raw content
      expect(result).toEqual({
        content: {
          title: "Generated Title",
          content: "Generated Content",
        },
        entityId: "generated-entity-123",
        message: "Generated and saved as entity generated-entity-123",
      });

      // Verify entity was created
      expect(createEntitySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "generated-content",
          schemaName: "testSchema",
          data: {
            title: "Generated Title",
            content: "Generated Content",
          },
        }),
      );
    });

    it("should use custom contentType when provided", async () => {
      const createEntitySpy = mockEntityService.createEntity as ReturnType<
        typeof mock
      >;

      await adapter.generateContent({
        prompt: "Generate test content",
        schemaName: "testSchema",
        save: true,
        contentType: "custom:type",
      });

      expect(createEntitySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: "custom:type",
        }),
      );
    });

    it("should include context in saved metadata", async () => {
      const createEntitySpy = mockEntityService.createEntity as ReturnType<
        typeof mock
      >;

      const context = {
        data: { key: "value" },
        style: "formal",
      };

      await adapter.generateContent({
        prompt: "Generate test content",
        schemaName: "testSchema",
        context,
        save: true,
      });

      expect(createEntitySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            prompt: "Generate test content",
            context,
            generatedBy: "claude-3-sonnet",
            regenerated: false,
          }),
        }),
      );
    });

    it("should handle generation errors gracefully", async () => {
      mockContentGenerationService.generate = async <T>(): Promise<T> => {
        throw new Error("Generation failed");
      };

      expect(
        adapter.generateContent({
          prompt: "Generate test content",
          schemaName: "testSchema",
        }),
      ).rejects.toThrow("Generation failed");
    });

    it("should handle entity creation errors when save=true", async () => {
      mockEntityService.createEntity = (async (): Promise<never> => {
        throw new Error("Entity creation failed");
      }) as unknown as typeof mockEntityService.createEntity;

      expect(
        adapter.generateContent({
          prompt: "Generate test content",
          schemaName: "testSchema",
          save: true,
        }),
      ).rejects.toThrow("Entity creation failed");
    });

    it("should include generated content in entity content field", async () => {
      const createEntitySpy = mockEntityService.createEntity as ReturnType<
        typeof mock
      >;

      await adapter.generateContent({
        prompt: "Generate test content",
        schemaName: "testSchema",
        save: true,
      });

      expect(createEntitySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          content: JSON.stringify(
            {
              title: "Generated Title",
              content: "Generated Content",
            },
            null,
            2,
          ),
        }),
      );
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
        undefined,
      );

      expect(result).toEqual({
        promotedId: "promoted-entity-123",
        promotedType: "note",
        message: "Promoted to note: promoted-entity-123",
      });
    });

    it("should pass additional fields when provided", async () => {
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
        { title: "Custom Title", tags: ["promoted", "test"] },
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
        undefined,
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
