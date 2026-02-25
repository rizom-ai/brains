import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { AIContentDataSource } from "../src/datasources/ai-content-datasource";
import type { IAIService } from "@brains/ai-service";
import type { IEntityService, SearchResult } from "@brains/plugins";
import {
  createMockEntityService,
  createMockAIService,
  createMockTemplateRegistry,
} from "@brains/test-utils";
import type { Template } from "@brains/templates";
import { z, EntityUrlGenerator } from "@brains/utils";

const messageSchema = z.object({ message: z.string() });
type Message = z.infer<typeof messageSchema>;

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

function createSearchEntity(overrides: {
  id: string;
  entityType: string;
  content: string;
  metadata?: Record<string, unknown>;
  excerpt: string;
}): SearchResult {
  return {
    entity: {
      id: overrides.id,
      entityType: overrides.entityType,
      content: overrides.content,
      metadata: overrides.metadata ?? {},
      contentHash: "abc",
      created: "2024-01-01",
      updated: "2024-01-01",
    },
    score: 0.9,
    excerpt: overrides.excerpt,
  };
}

function createDataSourceWithSearch(
  searchResults: ReturnType<typeof createSearchEntity>[],
  aiService: IAIService,
  templateRegistry: ReturnType<typeof createMockTemplateRegistry>,
  getIdentityContent: () => string,
  getProfileContent: () => string,
  siteBaseUrl?: string,
): AIContentDataSource {
  const entityService = createMockEntityService({
    returns: { search: searchResults },
  });

  return new AIContentDataSource(
    aiService,
    entityService,
    templateRegistry,
    getIdentityContent,
    getProfileContent,
    siteBaseUrl,
  );
}

describe("AIContentDataSource", () => {
  let aiContentDataSource: AIContentDataSource;
  let mockAIService: IAIService;
  let mockGenerateObject: ReturnType<typeof mock>;
  let mockEntityService: IEntityService;
  let mockTemplateRegistry: ReturnType<typeof createMockTemplateRegistry>;
  let mockTemplateGet: ReturnType<typeof mock>;
  let mockGetIdentityContent: ReturnType<typeof mock>;
  let mockGetProfileContent: ReturnType<typeof mock>;

  function getSystemPrompt(): string {
    return mockGenerateObject.mock.calls[0]?.[0];
  }

  function getUserPrompt(): string {
    return mockGenerateObject.mock.calls[0]?.[1];
  }

  async function generate(
    prompt: string,
    templateName = "test-template",
    conversationHistory?: string,
  ): Promise<Message> {
    return aiContentDataSource.generate(
      { templateName, prompt, conversationHistory },
      messageSchema,
    );
  }

  beforeEach(() => {
    EntityUrlGenerator.resetInstance();
    EntityUrlGenerator.getInstance().configure({
      post: { label: "Post" },
      deck: { label: "Deck" },
      note: { label: "Note" },
    });

    mockAIService = createMockAIService({
      returns: { generateObject: { message: "Test response" } },
    });
    mockGenerateObject = mockAIService.generateObject as ReturnType<
      typeof mock
    >;

    mockEntityService = createMockEntityService();

    mockTemplateRegistry = createMockTemplateRegistry({
      returns: { get: testTemplate },
    });
    mockTemplateGet = mockTemplateRegistry.get as ReturnType<typeof mock>;

    mockGetIdentityContent = mock(() => defaultIdentityContent);
    mockGetProfileContent = mock(() => defaultProfileContent);

    aiContentDataSource = new AIContentDataSource(
      mockAIService,
      mockEntityService,
      mockTemplateRegistry,
      mockGetIdentityContent,
      mockGetProfileContent,
    );
  });

  afterEach(() => {
    EntityUrlGenerator.resetInstance();
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
      await generate("Hello");

      expect(mockGenerateObject.mock.calls.length).toBeGreaterThan(0);
      const systemPrompt = getSystemPrompt();
      expect(systemPrompt).toContain("# Your Identity");
      expect(systemPrompt).toContain("Personal knowledge assistant");
      expect(systemPrompt).toContain("Help organize and retrieve information");
      expect(systemPrompt).toContain("clarity");
    });
  });

  describe("buildSystemPrompt with profile content", () => {
    it("should include profile content in system prompt", async () => {
      await generate("Hello");

      expect(mockGenerateObject.mock.calls.length).toBeGreaterThan(0);
      const systemPrompt = getSystemPrompt();
      expect(systemPrompt).toContain("# About the Person You Represent");
      expect(systemPrompt).toContain("Jan Hein");
      expect(systemPrompt).toContain("Educator and technologist");
    });

    it("should include template instructions in system prompt", async () => {
      await generate("Hello");

      expect(mockGenerateObject.mock.calls.length).toBeGreaterThan(0);
      const systemPrompt = getSystemPrompt();
      expect(systemPrompt).toContain("# Instructions");
      expect(systemPrompt).toContain("You are a helpful assistant.");
    });
  });

  describe("entity context with URLs", () => {
    it("should include URLs in entity context when siteBaseUrl is provided", async () => {
      const ds = createDataSourceWithSearch(
        [
          createSearchEntity({
            id: "my-blog-post",
            entityType: "post",
            content: "Test content",
            metadata: { slug: "my-blog-post" },
            excerpt: "This is a test blog post about AI",
          }),
        ],
        mockAIService,
        mockTemplateRegistry,
        mockGetIdentityContent,
        mockGetProfileContent,
        "yeehaa.io",
      );

      await ds.generate(
        { templateName: "test-template", prompt: "Tell me about AI" },
        messageSchema,
      );

      expect(getUserPrompt()).toContain("https://yeehaa.io/posts/my-blog-post");
    });

    it("should use entity slug for URL when available", async () => {
      const ds = createDataSourceWithSearch(
        [
          createSearchEntity({
            id: "deck-123",
            entityType: "deck",
            content: "Test deck",
            metadata: { slug: "my-presentation-slug" },
            excerpt: "A presentation about testing",
          }),
        ],
        mockAIService,
        mockTemplateRegistry,
        mockGetIdentityContent,
        mockGetProfileContent,
        "example.com",
      );

      await ds.generate(
        {
          templateName: "test-template",
          prompt: "Tell me about presentations",
        },
        messageSchema,
      );

      expect(getUserPrompt()).toContain(
        "https://example.com/decks/my-presentation-slug",
      );
    });

    it("should fall back to entity id when slug not available", async () => {
      const ds = createDataSourceWithSearch(
        [
          createSearchEntity({
            id: "note-456",
            entityType: "note",
            content: "Test note",
            excerpt: "A personal note",
          }),
        ],
        mockAIService,
        mockTemplateRegistry,
        mockGetIdentityContent,
        mockGetProfileContent,
        "example.com",
      );

      await ds.generate(
        { templateName: "test-template", prompt: "Find notes" },
        messageSchema,
      );

      expect(getUserPrompt()).toContain("https://example.com/notes/note-456");
    });

    it("should not include URLs when siteBaseUrl is not provided", async () => {
      const ds = createDataSourceWithSearch(
        [
          createSearchEntity({
            id: "my-blog-post",
            entityType: "post",
            content: "Test content",
            metadata: { slug: "my-blog-post" },
            excerpt: "This is a test blog post",
          }),
        ],
        mockAIService,
        mockTemplateRegistry,
        mockGetIdentityContent,
        mockGetProfileContent,
      );

      await ds.generate(
        { templateName: "test-template", prompt: "Tell me about blogs" },
        messageSchema,
      );

      const userPrompt = getUserPrompt();
      expect(userPrompt).not.toContain("https://");
      expect(userPrompt).toContain("[post] my-blog-post:");
    });
  });

  describe("generate", () => {
    it("should throw error if template not found", async () => {
      mockTemplateGet.mockReturnValue(undefined);

      void expect(generate("Hello", "nonexistent")).rejects.toThrow(
        "Template not found: nonexistent",
      );
    });

    it("should throw error if template has no basePrompt", async () => {
      mockTemplateGet.mockReturnValue({
        name: "no-prompt-template",
        description: "Template without basePrompt",
        schema: z.object({ message: z.string() }),
        requiredPermission: "public",
      });

      void expect(generate("Hello", "no-prompt-template")).rejects.toThrow(
        "must have basePrompt",
      );
    });

    it("should search for relevant entities", async () => {
      await generate("Find information about AI");

      expect(mockEntityService.search).toHaveBeenCalled();
    });

    it("should include conversation history in prompt when provided", async () => {
      await generate(
        "What was I asking about?",
        "test-template",
        "User: Tell me about AI\nAssistant: AI is...",
      );

      expect(mockGenerateObject.mock.calls.length).toBeGreaterThan(0);
      const userPrompt = getUserPrompt();
      expect(userPrompt).toContain("Recent conversation context");
      expect(userPrompt).toContain("Tell me about AI");
    });

    it("should validate output against schema", async () => {
      mockGenerateObject.mockResolvedValue({
        object: { wrongField: "value" },
      });

      void expect(generate("Hello")).rejects.toThrow();
    });
  });
});
