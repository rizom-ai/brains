import type {
  IAIService,
  AIModelConfig,
  AIModelConfigUpdate,
  ImageGenerationResult,
  JudgeInput,
  AIGenerationSchema,
} from "../src";
import type { LanguageModel } from "ai";

/**
 * Mock AI Service for testing
 * Prevents real API calls during testing
 */
export function createMockAIService(): IAIService {
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
      schema: AIGenerationSchema<T>,
    ): Promise<{
      object: T;
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
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
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      };
    },

    judge: async <T>(
      input: JudgeInput<T>,
    ): Promise<{
      verdict: T;
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    }> => {
      const { object, usage } = await mockService.generateObject(
        "Mock judge",
        [input.instruction, input.material].join("\n\n"),
        input.schema,
      );
      return { verdict: object, usage };
    },

    updateConfig: (_config: AIModelConfigUpdate): void => {
      // Mock implementation - does nothing
    },

    getConfig: (): AIModelConfig => {
      return {
        model: "mock-model",
        apiKey: "mock-key",
        temperature: 0.7,
        maxTokens: 1000,
      };
    },

    getModel: (): LanguageModel => {
      return "mock-language-model" as unknown as LanguageModel;
    },

    generateImage: async (): Promise<ImageGenerationResult> => {
      const base64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      return {
        base64,
        dataUrl: `data:image/png;base64,${base64}`,
      };
    },

    canGenerateImages: (): boolean => {
      return false;
    },
  };

  return mockService;
}
