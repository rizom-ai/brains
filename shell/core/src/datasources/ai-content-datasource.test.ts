import { describe, it, expect, beforeEach, mock } from "bun:test";
import { AIContentDataSource } from "./ai-content-datasource";
import type { IAIService } from "@brains/ai-service";
import type { IEntityService } from "@brains/plugins";
import {
  createMockEntityService,
  createMockAIService,
  createMockTemplateRegistry,
} from "@brains/test-utils";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils";

describe("AIContentDataSource", () => {
  let aiContentDataSource: AIContentDataSource;
  let mockAIService: IAIService;
  let mockGenerateObject: ReturnType<typeof mock>;
  let mockEntityService: IEntityService;
  let mockTemplateRegistryInstance: ReturnType<
    typeof createMockTemplateRegistry
  >;
  let mockTemplateGet: ReturnType<typeof mock>;
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
    mockAIService = createMockAIService({
      returns: {
        generateObject: { message: "Test response" },
      },
    });
    mockGenerateObject = mockAIService.generateObject as ReturnType<
      typeof mock
    >;

    mockEntityService = createMockEntityService();

    mockTemplateRegistryInstance = createMockTemplateRegistry({
      returns: {
        get: testTemplate,
      },
    });
    mockTemplateGet = mockTemplateRegistryInstance.get as ReturnType<
      typeof mock
    >;

    mockGetIdentityContent = mock(() => defaultIdentityContent);
    mockGetProfileContent = mock(() => defaultProfileContent);

    aiContentDataSource = new AIContentDataSource(
      mockAIService,
      mockEntityService,
      mockTemplateRegistryInstance,
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

  describe("entity context with URLs", () => {
    it("should include URLs in entity context when siteBaseUrl is provided", async () => {
      const entityServiceWithSearch = createMockEntityService({
        returns: {
          search: [
            {
              entity: {
                id: "my-blog-post",
                entityType: "post",
                content: "Test content",
                metadata: { slug: "my-blog-post" },
                contentHash: "abc",
                created: "2024-01-01",
                updated: "2024-01-01",
              },
              score: 0.9,
              excerpt: "This is a test blog post about AI",
            },
          ],
        },
      });

      const dataSourceWithUrl = new AIContentDataSource(
        mockAIService,
        entityServiceWithSearch,
        mockTemplateRegistryInstance,
        mockGetIdentityContent,
        mockGetProfileContent,
        "yeehaa.io",
      );

      const schema = z.object({ message: z.string() });
      await dataSourceWithUrl.generate(
        { templateName: "test-template", prompt: "Tell me about AI" },
        schema,
      );

      const userPromptArg = mockGenerateObject.mock.calls[0]?.[1];
      expect(userPromptArg).toContain("https://yeehaa.io/posts/my-blog-post");
    });

    it("should use entity slug for URL when available", async () => {
      const entityServiceWithSearch = createMockEntityService({
        returns: {
          search: [
            {
              entity: {
                id: "deck-123",
                entityType: "deck",
                content: "Test deck",
                metadata: { slug: "my-presentation-slug" },
                contentHash: "abc",
                created: "2024-01-01",
                updated: "2024-01-01",
              },
              score: 0.9,
              excerpt: "A presentation about testing",
            },
          ],
        },
      });

      const dataSourceWithUrl = new AIContentDataSource(
        mockAIService,
        entityServiceWithSearch,
        mockTemplateRegistryInstance,
        mockGetIdentityContent,
        mockGetProfileContent,
        "example.com",
      );

      const schema = z.object({ message: z.string() });
      await dataSourceWithUrl.generate(
        {
          templateName: "test-template",
          prompt: "Tell me about presentations",
        },
        schema,
      );

      const userPromptArg = mockGenerateObject.mock.calls[0]?.[1];
      expect(userPromptArg).toContain(
        "https://example.com/decks/my-presentation-slug",
      );
    });

    it("should fall back to entity id when slug not available", async () => {
      const entityServiceWithSearch = createMockEntityService({
        returns: {
          search: [
            {
              entity: {
                id: "note-456",
                entityType: "note",
                content: "Test note",
                metadata: {},
                contentHash: "abc",
                created: "2024-01-01",
                updated: "2024-01-01",
              },
              score: 0.9,
              excerpt: "A personal note",
            },
          ],
        },
      });

      const dataSourceWithUrl = new AIContentDataSource(
        mockAIService,
        entityServiceWithSearch,
        mockTemplateRegistryInstance,
        mockGetIdentityContent,
        mockGetProfileContent,
        "example.com",
      );

      const schema = z.object({ message: z.string() });
      await dataSourceWithUrl.generate(
        { templateName: "test-template", prompt: "Find notes" },
        schema,
      );

      const userPromptArg = mockGenerateObject.mock.calls[0]?.[1];
      expect(userPromptArg).toContain("https://example.com/notes/note-456");
    });

    it("should not include URLs when siteBaseUrl is not provided", async () => {
      const entityServiceWithSearch = createMockEntityService({
        returns: {
          search: [
            {
              entity: {
                id: "my-blog-post",
                entityType: "post",
                content: "Test content",
                metadata: { slug: "my-blog-post" },
                contentHash: "abc",
                created: "2024-01-01",
                updated: "2024-01-01",
              },
              score: 0.9,
              excerpt: "This is a test blog post",
            },
          ],
        },
      });

      const dataSourceWithoutUrl = new AIContentDataSource(
        mockAIService,
        entityServiceWithSearch,
        mockTemplateRegistryInstance,
        mockGetIdentityContent,
        mockGetProfileContent,
        // No siteBaseUrl
      );

      const schema = z.object({ message: z.string() });
      await dataSourceWithoutUrl.generate(
        { templateName: "test-template", prompt: "Tell me about blogs" },
        schema,
      );

      const userPromptArg = mockGenerateObject.mock.calls[0]?.[1];
      expect(userPromptArg).not.toContain("https://");
      expect(userPromptArg).toContain("[post] my-blog-post:");
    });
  });

  describe("generate", () => {
    it("should throw error if template not found", async () => {
      mockTemplateGet.mockReturnValue(undefined);

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
      mockTemplateGet.mockReturnValue({
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
