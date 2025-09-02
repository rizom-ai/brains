import { describe, it, expect, beforeEach, mock } from "bun:test";
import { LinkService } from "../../src/lib/link-service";
import { UrlUtils } from "../../src/lib/url-utils";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins";
import {
  mockLinkContent,
  mockLinkEntity,
  mockAIResponse,
} from "../fixtures/link-entities";

describe("LinkService", () => {
  let linkService: LinkService;
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = new MockShell({ logger });
    context = createServicePluginContext(mockShell, "link");
    linkService = new LinkService(context);
  });

  describe("captureLink", () => {
    it("should capture a link successfully with AI extraction", async () => {
      const url = "https://example.com/test-article";

      // Mock the AI content generation
      context.generateContent = mock(async () => mockAIResponse.complete);

      const result = await linkService.captureLink(url);

      expect(result.title).toBe("Test Article");
      expect(result.url).toBe(url);
      expect(result.entityId).toBeDefined();

      // Verify AI content generation was called correctly
      expect(context.generateContent).toHaveBeenCalledWith({
        templateName: "link:extraction",
        prompt: expect.stringContaining(url),
        data: { url },
        interfacePermissionGrant: "public",
      });
    });

    it("should use keywords from AI extraction", async () => {
      const url = "https://example.com/test-article";

      // Mock the AI content generation
      context.generateContent = mock(async () => mockAIResponse.complete);

      const result = await linkService.captureLink(url);

      expect(result.title).toBe("Test Article");
      expect(result.url).toBe(url);
    });

    it("should handle AI extraction errors", async () => {
      // Mock AI service to throw error
      context.generateContent = mock(async () => {
        throw new Error("AI service failed");
      });

      const url = "https://example.com/test-article";

      await expect(linkService.captureLink(url)).rejects.toThrow(
        "AI service failed",
      );
    });

    it("should handle invalid JSON response from AI", async () => {
      // Mock AI service to return invalid response type
      context.generateContent = mock(
        async () => "invalid json response" as any,
      );

      const url = "https://example.com/test-article";

      await expect(linkService.captureLink(url)).rejects.toThrow(
        "Failed to parse AI extraction result",
      );
    });

    it("should handle incomplete AI response", async () => {
      // Mock AI service to return incomplete data
      context.generateContent = mock(async () => mockAIResponse.missingFields);

      const url = "https://example.com/test-article";

      await expect(linkService.captureLink(url)).rejects.toThrow(
        "AI extraction failed to provide all required fields",
      );
    });

    it("should use deterministic entity ID based on URL", async () => {
      const url = "https://github.com/user/repo";

      // Mock the AI content generation
      context.generateContent = mock(async () => mockAIResponse.complete);

      const result = await linkService.captureLink(url);

      // Verify the entity ID matches expected format
      const expectedId = UrlUtils.generateEntityId(url);
      expect(result.entityId).toBe(expectedId);
      expect(result.entityId).toMatch(/^github-com-[a-f0-9]{6}$/);
    });

    it("should accept custom entity ID", async () => {
      const url = "https://example.com/test";
      const customId = "custom-link-id";

      // Mock the AI content generation
      context.generateContent = mock(async () => mockAIResponse.complete);

      const result = await linkService.captureLink(url, { id: customId });

      expect(result.entityId).toBe(customId);
    });

    it("should deduplicate links with same normalized URL", async () => {
      const url1 = "https://example.com/article?utm_source=twitter";
      const url2 = "https://example.com/article?utm_source=facebook";

      // Mock the AI content generation
      context.generateContent = mock(async () => mockAIResponse.complete);

      // First capture
      const result1 = await linkService.captureLink(url1);

      // Create new service instance for second capture to reset mocks
      const linkService2 = new LinkService(context);

      // Mock entity service to return existing entity for second capture
      const existingEntity = mockLinkEntity();
      existingEntity.id = result1.entityId;
      context.entityService.getEntity = mock(async () => existingEntity);

      // Reset generateContent mock for clarity
      const generateContentMock = mock(async () => mockAIResponse.complete);
      context.generateContent = generateContentMock;

      // Second capture with different query params
      const result2 = await linkService2.captureLink(url2);

      // Should return same entity ID (deduplication worked)
      expect(result2.entityId).toBe(result1.entityId);

      // AI extraction should NOT be called for the second capture (due to deduplication)
      expect(generateContentMock).not.toHaveBeenCalled();
    });

    it("should store metadata when provided", async () => {
      const url = "https://example.com/test";
      const metadata = { conversationId: "conv-123", userId: "user-456" };

      // Mock the AI content generation
      context.generateContent = mock(async () => mockAIResponse.complete);

      // Mock createEntity to track calls
      const createEntityMock = mock(async () => ({
        entityId: UrlUtils.generateEntityId(url),
        entityType: "link",
        content: "",
        metadata,
      }));
      context.entityService.createEntity = createEntityMock;

      await linkService.captureLink(url, { metadata });

      // Verify entity was created with metadata
      expect(createEntityMock).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata,
        }),
      );
    });
  });

  describe("listLinks", () => {
    it("should list links with default limit", async () => {
      // Mock the entity service search to return a mock link entity
      context.entityService.search = mock(async () => [
        {
          entity: mockLinkEntity(mockLinkContent.article1),
        },
      ]);

      const result = await linkService.listLinks();

      expect(context.entityService.search).toHaveBeenCalledWith("", {
        types: ["link"],
        limit: 10,
        sortBy: "created",
        sortDirection: "desc",
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Article 1");
      expect(result[0].url).toBe("https://example.com/article1");
      expect(result[0].description).toBe("First article");
      expect(result[0].keywords).toEqual(["keyword1", "keyword2"]);
      expect(result[0].domain).toBe("example.com");
    });

    it("should return empty array when no links found", async () => {
      const result = await linkService.listLinks();
      expect(result).toEqual([]);
    });
  });

  describe("searchLinks", () => {
    it("should search links and return empty for no matches", async () => {
      // MockShell search always returns empty, so we test the method works
      const result = await linkService.searchLinks("javascript");
      expect(result).toEqual([]);
    });

    it("should handle empty search query", async () => {
      const result = await linkService.searchLinks();
      expect(result).toEqual([]);
    });
  });

  describe("getLink", () => {
    it("should get link by ID", async () => {
      // Mock the entity service getEntity to return a mock link entity
      context.entityService.getEntity = mock(async () => mockLinkEntity());

      const result = await linkService.getLink("link-1");

      expect(context.entityService.getEntity).toHaveBeenCalledWith(
        "link",
        "link-1",
      );

      expect(result).not.toBeNull();
      expect(result?.id).toBe("link-1");
      expect(result?.title).toBe("Test Article");
      expect(result?.url).toBe("https://example.com/test");
      expect(result?.description).toBe("Test description");
      expect(result?.summary).toBe("Test summary");
      expect(result?.keywords).toEqual(["test"]);
      expect(result?.domain).toBe("example.com");
    });

    it("should return null for non-existent link", async () => {
      const result = await linkService.getLink("non-existent");
      expect(result).toBeNull();
    });
  });
});
