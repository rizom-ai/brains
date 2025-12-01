import { describe, it, expect, beforeEach, mock, type Mock } from "bun:test";
import { AIContentDataSource } from "./ai-content-datasource";
import type { IAIService } from "@brains/ai-service";
import type { IEntityService } from "@brains/entity-service";
import type { TemplateRegistry, Template } from "@brains/templates";
import { z } from "@brains/utils";

describe("AIContentDataSource", () => {
  let aiContentDataSource: AIContentDataSource;
  let mockGenerateObject: Mock<
    (
      systemPrompt: string,
      userPrompt: string,
      schema: unknown,
    ) => Promise<{ object: unknown }>
  >;
  let mockAIService: {
    generateObject: typeof mockGenerateObject;
  };
  let mockEntityService: {
    search: ReturnType<typeof mock>;
  };
  let mockTemplateRegistry: {
    get: ReturnType<typeof mock>;
  };
  let mockGetIdentityContent: ReturnType<typeof mock>;
  let mockGetProfileContent: ReturnType<typeof mock>;

  const defaultIdentityContent = `# Identity

**Name:** Test Brain
**Role:** Personal knowledge assistant
**Purpose:** Help organize and retrieve information
**Values:** clarity, accuracy`;

  const defaultProfileContent = `# Profile

**Name:** Jan Hein
**Description:** Educator and technologist
**Email:** test@example.com
**Website:** https://example.com`;

  const testTemplate: Template = {
    name: "test-template",
    description: "Test template",
    basePrompt: "You are a helpful assistant.",
    schema: z.object({ message: z.string() }),
    requiredPermission: "public",
  };

  beforeEach(() => {
    mockGenerateObject = mock(() =>
      Promise.resolve({ object: { message: "Test response" } }),
    );
    mockAIService = {
      generateObject: mockGenerateObject,
    };

    mockEntityService = {
      search: mock(() => Promise.resolve([])),
    };

    mockTemplateRegistry = {
      get: mock(() => testTemplate),
    };

    mockGetIdentityContent = mock(() => defaultIdentityContent);
    mockGetProfileContent = mock(() => defaultProfileContent);

    aiContentDataSource = new AIContentDataSource(
      mockAIService as unknown as IAIService,
      mockEntityService as unknown as IEntityService,
      mockTemplateRegistry as unknown as TemplateRegistry,
      mockGetIdentityContent,
      mockGetProfileContent,
    );
  });

  describe("metadata", () => {
    it("should have correct id", () => {
      expect(aiContentDataSource.id).toBe("ai-content");
    });

    it("should have correct name", () => {
      expect(aiContentDataSource.name).toBe("AI Content Generator");
    });

    it("should have description", () => {
      expect(aiContentDataSource.description).toBeDefined();
    });
  });

  describe("buildSystemPrompt with identity content", () => {
    it("should include identity content in system prompt", async () => {
      const schema = z.object({ message: z.string() });

      await aiContentDataSource.generate(
        {
          templateName: "test-template",
          prompt: "Hello",
        },
        schema,
      );

      expect(mockGenerateObject.mock.calls.length).toBeGreaterThan(0);
      const systemPromptArg = mockGenerateObject.mock.calls[0]?.[0];
      expect(systemPromptArg).toContain("# Your Identity");
      expect(systemPromptArg).toContain("Personal knowledge assistant");
      expect(systemPromptArg).toContain(
        "Help organize and retrieve information",
      );
      expect(systemPromptArg).toContain("clarity");
    });
  });

  describe("buildSystemPrompt with profile content", () => {
    it("should include profile content in system prompt", async () => {
      const schema = z.object({ message: z.string() });

      await aiContentDataSource.generate(
        {
          templateName: "test-template",
          prompt: "Hello",
        },
        schema,
      );

      expect(mockGenerateObject.mock.calls.length).toBeGreaterThan(0);
      const systemPromptArg = mockGenerateObject.mock.calls[0]?.[0];
      expect(systemPromptArg).toContain("# About the Person You Represent");
      expect(systemPromptArg).toContain("Jan Hein");
      expect(systemPromptArg).toContain("Educator and technologist");
    });

    it("should include template instructions in system prompt", async () => {
      const schema = z.object({ message: z.string() });

      await aiContentDataSource.generate(
        {
          templateName: "test-template",
          prompt: "Hello",
        },
        schema,
      );

      expect(mockGenerateObject.mock.calls.length).toBeGreaterThan(0);
      const systemPromptArg = mockGenerateObject.mock.calls[0]?.[0];
      expect(systemPromptArg).toContain("# Instructions");
      expect(systemPromptArg).toContain("You are a helpful assistant.");
    });
  });

  describe("generate", () => {
    it("should throw error if template not found", async () => {
      mockTemplateRegistry.get.mockReturnValue(undefined);

      const schema = z.object({ message: z.string() });

      void expect(
        aiContentDataSource.generate(
          {
            templateName: "nonexistent",
            prompt: "Hello",
          },
          schema,
        ),
      ).rejects.toThrow("Template not found: nonexistent");
    });

    it("should throw error if template has no basePrompt", async () => {
      mockTemplateRegistry.get.mockReturnValue({
        name: "no-prompt-template",
        description: "Template without basePrompt",
        schema: z.object({ message: z.string() }),
        requiredPermission: "public",
      });

      const schema = z.object({ message: z.string() });

      void expect(
        aiContentDataSource.generate(
          {
            templateName: "no-prompt-template",
            prompt: "Hello",
          },
          schema,
        ),
      ).rejects.toThrow("must have basePrompt");
    });

    it("should search for relevant entities", async () => {
      const schema = z.object({ message: z.string() });

      await aiContentDataSource.generate(
        {
          templateName: "test-template",
          prompt: "Find information about AI",
        },
        schema,
      );

      expect(mockEntityService.search).toHaveBeenCalled();
    });

    it("should include conversation history in prompt when provided", async () => {
      const schema = z.object({ message: z.string() });

      await aiContentDataSource.generate(
        {
          templateName: "test-template",
          prompt: "What was I asking about?",
          conversationHistory: "User: Tell me about AI\nAssistant: AI is...",
        },
        schema,
      );

      expect(mockGenerateObject.mock.calls.length).toBeGreaterThan(0);
      const userPromptArg = mockGenerateObject.mock.calls[0]?.[1];
      expect(userPromptArg).toContain("Recent conversation context");
      expect(userPromptArg).toContain("Tell me about AI");
    });

    it("should validate output against schema", async () => {
      mockGenerateObject.mockResolvedValue({
        object: { wrongField: "value" },
      });

      const schema = z.object({ message: z.string() });

      void expect(
        aiContentDataSource.generate(
          {
            templateName: "test-template",
            prompt: "Hello",
          },
          schema,
        ),
      ).rejects.toThrow();
    });
  });
});
