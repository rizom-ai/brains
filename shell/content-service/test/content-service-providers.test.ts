import { describe, it, expect, beforeEach } from "bun:test";
import { ContentService } from "../src/content-service";
import type { ContentServiceDependencies } from "../src/content-service";
import type { IContentProvider, Content, GenerateRequest } from "../src/interfaces/provider";
import { createSilentLogger } from "@brains/utils";

class MockContentProvider implements IContentProvider {
  constructor(
    public readonly id: string,
    public readonly name: string = "Mock Provider",
    public readonly version: string = "1.0.0"
  ) {}

  getContentTypes() {
    return [
      { id: "page", name: "Page", description: "A web page" },
      { id: "email", name: "Email", description: "An email template" },
    ];
  }

  async generate(request: GenerateRequest): Promise<Content> {
    return {
      id: `${this.id}-content-${Date.now()}`,
      provider: this.id,
      type: request.type,
      data: request.data,
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        requestContext: request.context,
      },
    };
  }
}

describe("ContentService - Provider Methods", () => {
  let contentService: ContentService;
  let dependencies: ContentServiceDependencies;

  beforeEach(() => {
    const logger = createSilentLogger();
    
    dependencies = {
      logger,
      entityService: {
        search: async () => [],
      } as any,
      aiService: {
        generateObject: async () => ({ object: {} }),
      } as any,
      conversationService: {
        getMessages: async () => [],
      } as any,
    };

    contentService = new ContentService(dependencies);
  });

  describe("registerProvider", () => {
    it("should register a provider", () => {
      const provider = new MockContentProvider("test-provider");
      
      contentService.registerProvider(provider);
      
      expect(contentService.getProvider("test-provider")).toBe(provider);
    });

    it("should allow multiple providers", () => {
      const provider1 = new MockContentProvider("provider1");
      const provider2 = new MockContentProvider("provider2");
      
      contentService.registerProvider(provider1);
      contentService.registerProvider(provider2);
      
      const providers = contentService.listProviders();
      expect(providers).toHaveLength(2);
      expect(providers).toContain(provider1);
      expect(providers).toContain(provider2);
    });
  });

  describe("unregisterProvider", () => {
    it("should unregister a provider", () => {
      const provider = new MockContentProvider("test-provider");
      
      contentService.registerProvider(provider);
      expect(contentService.getProvider("test-provider")).toBe(provider);
      
      contentService.unregisterProvider("test-provider");
      expect(contentService.getProvider("test-provider")).toBeUndefined();
    });
  });

  describe("generate", () => {
    it("should generate content using a provider", async () => {
      const provider = new MockContentProvider("test-provider");
      contentService.registerProvider(provider);
      
      const result = await contentService.generate({
        provider: "test-provider",
        type: "page",
        data: { title: "Test Page" },
      });
      
      expect(result.provider).toBe("test-provider");
      expect(result.type).toBe("page");
      expect(result.data).toEqual({ title: "Test Page" });
    });

    it("should pass context to provider", async () => {
      const provider = new MockContentProvider("test-provider");
      contentService.registerProvider(provider);
      
      const context = { userId: "user123", conversationId: "conv456" };
      const result = await contentService.generate({
        provider: "test-provider",
        type: "page",
        data: { title: "Test Page" },
        context,
      });
      
      expect(result.metadata.requestContext).toEqual(context);
    });

    it("should throw error for non-existent provider", async () => {
      await expect(
        contentService.generate({
          provider: "non-existent",
          type: "page",
          data: {},
        })
      ).rejects.toThrow("Provider not found: non-existent");
    });
  });

  describe("getAvailableContentTypes", () => {
    it("should return content types from all providers", () => {
      const provider1 = new MockContentProvider("provider1");
      const provider2 = new MockContentProvider("provider2");
      
      contentService.registerProvider(provider1);
      contentService.registerProvider(provider2);
      
      const types = contentService.getAvailableContentTypes();
      
      expect(types).toHaveLength(2);
      expect(types[0]).toEqual({
        provider: "provider1",
        types: provider1.getContentTypes(),
      });
      expect(types[1]).toEqual({
        provider: "provider2",
        types: provider2.getContentTypes(),
      });
    });

    it("should return empty array when no providers registered", () => {
      expect(contentService.getAvailableContentTypes()).toEqual([]);
    });
  });

  describe("listProviders", () => {
    it("should list all registered providers", () => {
      const provider1 = new MockContentProvider("provider1", "Provider One");
      const provider2 = new MockContentProvider("provider2", "Provider Two");
      
      contentService.registerProvider(provider1);
      contentService.registerProvider(provider2);
      
      const providers = contentService.listProviders();
      
      expect(providers).toHaveLength(2);
      expect(providers.map(p => p.id)).toContain("provider1");
      expect(providers.map(p => p.id)).toContain("provider2");
    });
  });
});