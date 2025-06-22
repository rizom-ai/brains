import type { AIService } from "@brains/shell/src/ai/aiService";
import type { z } from "zod";

/**
 * Mock AI Service for integration tests
 * Prevents real API calls during testing
 */
export function createMockAIService(): AIService {
  const mockService = {
    generateText: async (
      _systemPrompt: string,
      userPrompt: string,
    ): Promise<{
      text: string;
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    }> => {
      return {
        text: "Mock AI response for: " + userPrompt.slice(0, 50),
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      };
    },
    generateObject: async <T>(
      _systemPrompt: string,
      userPrompt: string,
      schema: z.ZodType<T>,
    ): Promise<{
      object: T;
      usage: { inputTokens: number; outputTokens: number };
    }> => {
      // Return a mock object based on the query
      let mockObject: unknown;

      if (userPrompt.includes("landing page")) {
        mockObject = {
          title: "Test Brain",
          tagline: "Test Description",
          hero: {
            headline: "Mock Headline",
            subheadline: "Mock Subheadline",
            ctaText: "Get Started",
            ctaLink: "#features",
          },
        };
      } else if (
        userPrompt.includes("create") ||
        userPrompt.includes("Create")
      ) {
        mockObject = {
          action: "create",
          entityType: "note",
          title: "Test Note",
          content: "Test content",
          response: "Created successfully",
        };
      } else if (
        userPrompt.includes("search") ||
        userPrompt.includes("Search")
      ) {
        mockObject = {
          query: userPrompt,
          results: [],
          explanation: "No results found",
          suggestions: [],
        };
      } else {
        // Default mock response
        mockObject = {
          query: userPrompt,
          response: "Mock response",
          results: [],
        };
      }

      // Parse with schema to ensure it matches
      const parsed = schema.parse(mockObject);

      return {
        object: parsed,
        usage: {
          inputTokens: 100,
          outputTokens: 50,
        },
      };
    },
  };

  return mockService as unknown as AIService;
}
