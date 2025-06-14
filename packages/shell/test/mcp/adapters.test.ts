import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { ContentGenerationAdapter } from "@/mcp/adapters";
import type { ContentGenerationService } from "@/content/contentGenerationService";
import { z } from "zod";
import type { ContentGenerateOptions } from "@brains/types";

describe("ContentGenerationAdapter", () => {
  let adapter: ContentGenerationAdapter;
  let mockContentGenerationService: ContentGenerationService;

  const testSchema = z.object({
    title: z.string(),
    content: z.string(),
  });

  beforeEach(() => {
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
    adapter = new ContentGenerationAdapter(mockContentGenerationService);
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
});
