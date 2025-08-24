import { describe, it, expect, beforeEach, vi } from "vitest";
import { ContentService } from "../src/content-service";
import type { ContentServiceDependencies } from "../src/content-service";
import type { IContentProvider } from "../src/providers/types";
import { createSilentLogger } from "@brains/utils";
import type { EntityService } from "@brains/entity-service";
import type { IAIService } from "@brains/ai-service";
import type { IConversationService } from "@brains/conversation-service";

// Mock dependencies
const mockDependencies: ContentServiceDependencies = {
  logger: createSilentLogger(),
  entityService: {} as EntityService,
  aiService: {} as IAIService,
  conversationService: {} as IConversationService,
};

// Mock provider
class MockProvider implements IContentProvider {
  id = "mock-provider";
  name = "Mock Provider";

  generate = vi.fn(async (request: unknown) => {
    return { generated: true, request };
  });

  fetch = vi.fn(async (query: unknown) => {
    return { fetched: true, query };
  });

  transform = vi.fn(async (content: unknown, format: string) => {
    return { transformed: true, content, format };
  });
}

// Provider without all methods
class PartialProvider implements IContentProvider {
  id = "partial-provider";
  name = "Partial Provider";

  fetch = vi.fn(async (query: unknown) => {
    return { data: "some data", query };
  });
}

describe("ContentService - Provider Management", () => {
  let contentService: ContentService;
  let mockProvider: MockProvider;
  let partialProvider: PartialProvider;

  beforeEach(() => {
    contentService = new ContentService(mockDependencies);
    mockProvider = new MockProvider();
    partialProvider = new PartialProvider();
  });

  describe("registerProvider", () => {
    it("should register a provider successfully", () => {
      contentService.registerProvider(mockProvider);
      const provider = contentService.getProvider("mock-provider");
      expect(provider).toBe(mockProvider);
    });

    it("should throw error when registering duplicate provider", () => {
      contentService.registerProvider(mockProvider);
      expect(() => contentService.registerProvider(mockProvider)).toThrow(
        'Provider with id "mock-provider" is already registered'
      );
    });

    it("should register provider with partial methods", () => {
      contentService.registerProvider(partialProvider);
      const provider = contentService.getProvider("partial-provider");
      expect(provider).toBe(partialProvider);
    });
  });

  describe("getProvider", () => {
    it("should return registered provider", () => {
      contentService.registerProvider(mockProvider);
      const provider = contentService.getProvider("mock-provider");
      expect(provider).toBe(mockProvider);
    });

    it("should return undefined for non-existent provider", () => {
      const provider = contentService.getProvider("non-existent");
      expect(provider).toBeUndefined();
    });
  });

  describe("listProviders", () => {
    it("should return empty array when no providers", () => {
      const providers = contentService.listProviders();
      expect(providers).toEqual([]);
    });

    it("should return all registered providers", () => {
      contentService.registerProvider(mockProvider);
      contentService.registerProvider(partialProvider);
      const providers = contentService.listProviders();
      expect(providers).toHaveLength(2);
      expect(providers).toContain(mockProvider);
      expect(providers).toContain(partialProvider);
    });
  });

  describe("getProviderInfo", () => {
    it("should return provider info with capabilities", () => {
      contentService.registerProvider(mockProvider);
      const info = contentService.getProviderInfo("mock-provider");
      expect(info).toEqual({
        id: "mock-provider",
        name: "Mock Provider",
        capabilities: {
          canGenerate: true,
          canFetch: true,
          canTransform: true,
        },
      });
    });

    it("should return correct capabilities for partial provider", () => {
      contentService.registerProvider(partialProvider);
      const info = contentService.getProviderInfo("partial-provider");
      expect(info).toEqual({
        id: "partial-provider",
        name: "Partial Provider",
        capabilities: {
          canGenerate: false,
          canFetch: true,
          canTransform: false,
        },
      });
    });

    it("should return undefined for non-existent provider", () => {
      const info = contentService.getProviderInfo("non-existent");
      expect(info).toBeUndefined();
    });
  });

  describe("getAllProviderInfo", () => {
    it("should return info for all providers", () => {
      contentService.registerProvider(mockProvider);
      contentService.registerProvider(partialProvider);
      const infos = contentService.getAllProviderInfo();
      expect(infos).toHaveLength(2);
      expect(infos[0].id).toBe("mock-provider");
      expect(infos[1].id).toBe("partial-provider");
    });
  });

  describe("generateFromProvider", () => {
    it("should generate content using provider", async () => {
      contentService.registerProvider(mockProvider);
      const request = { template: "test", data: "some data" };
      const result = await contentService.generateFromProvider("mock-provider", request);
      
      expect(mockProvider.generate).toHaveBeenCalledWith(request);
      expect(result).toEqual({ generated: true, request });
    });

    it("should throw error for non-existent provider", async () => {
      await expect(
        contentService.generateFromProvider("non-existent", {})
      ).rejects.toThrow('Provider "non-existent" not found');
    });

    it("should throw error if provider doesn't support generation", async () => {
      contentService.registerProvider(partialProvider);
      await expect(
        contentService.generateFromProvider("partial-provider", {})
      ).rejects.toThrow('Provider "partial-provider" does not support generation');
    });
  });

  describe("fetchFromProvider", () => {
    it("should fetch data using provider", async () => {
      contentService.registerProvider(mockProvider);
      const query = { filter: "test" };
      const result = await contentService.fetchFromProvider("mock-provider", query);
      
      expect(mockProvider.fetch).toHaveBeenCalledWith(query);
      expect(result).toEqual({ fetched: true, query });
    });

    it("should work with partial provider that has fetch", async () => {
      contentService.registerProvider(partialProvider);
      const query = { id: "123" };
      const result = await contentService.fetchFromProvider("partial-provider", query);
      
      expect(partialProvider.fetch).toHaveBeenCalledWith(query);
      expect(result).toEqual({ data: "some data", query });
    });

    it("should throw error for non-existent provider", async () => {
      await expect(
        contentService.fetchFromProvider("non-existent", {})
      ).rejects.toThrow('Provider "non-existent" not found');
    });
  });

  describe("transformWithProvider", () => {
    it("should transform content using provider", async () => {
      contentService.registerProvider(mockProvider);
      const content = { text: "hello" };
      const format = "html";
      const result = await contentService.transformWithProvider(
        "mock-provider",
        content,
        format
      );
      
      expect(mockProvider.transform).toHaveBeenCalledWith(content, format);
      expect(result).toEqual({ transformed: true, content, format });
    });

    it("should throw error if provider doesn't support transformation", async () => {
      contentService.registerProvider(partialProvider);
      await expect(
        contentService.transformWithProvider("partial-provider", {}, "html")
      ).rejects.toThrow('Provider "partial-provider" does not support transformation');
    });

    it("should throw error for non-existent provider", async () => {
      await expect(
        contentService.transformWithProvider("non-existent", {}, "html")
      ).rejects.toThrow('Provider "non-existent" not found');
    });
  });
});