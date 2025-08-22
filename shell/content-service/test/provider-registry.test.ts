import { describe, it, expect, beforeEach } from "bun:test";
import { ProviderRegistry } from "../src/core/provider-registry";
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
      },
    };
  }
}

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;
  let logger: ReturnType<typeof createSilentLogger>;

  beforeEach(() => {
    logger = createSilentLogger();
    registry = new ProviderRegistry(logger);
  });

  describe("register", () => {
    it("should register a provider successfully", () => {
      const provider = new MockContentProvider("test-provider");
      
      registry.register(provider);
      
      expect(registry.has("test-provider")).toBe(true);
      expect(registry.get("test-provider")).toBe(provider);
    });

    it("should throw error when registering duplicate provider", () => {
      const provider1 = new MockContentProvider("test-provider");
      const provider2 = new MockContentProvider("test-provider");
      
      registry.register(provider1);
      
      expect(() => registry.register(provider2)).toThrow(
        'Provider with ID "test-provider" is already registered'
      );
    });

    it("should map content types to provider", () => {
      const provider = new MockContentProvider("test-provider");
      
      registry.register(provider);
      
      const providerForType = registry.getProviderForType("test-provider", "page");
      expect(providerForType).toBe(provider);
    });
  });

  describe("unregister", () => {
    it("should unregister a provider", () => {
      const provider = new MockContentProvider("test-provider");
      
      registry.register(provider);
      expect(registry.has("test-provider")).toBe(true);
      
      registry.unregister("test-provider");
      expect(registry.has("test-provider")).toBe(false);
    });

    it("should remove type mappings when unregistering", () => {
      const provider = new MockContentProvider("test-provider");
      
      registry.register(provider);
      expect(registry.getProviderForType("test-provider", "page")).toBe(provider);
      
      registry.unregister("test-provider");
      expect(registry.getProviderForType("test-provider", "page")).toBeUndefined();
    });

    it("should handle unregistering non-existent provider gracefully", () => {
      expect(() => registry.unregister("non-existent")).not.toThrow();
    });
  });

  describe("get", () => {
    it("should return registered provider", () => {
      const provider = new MockContentProvider("test-provider");
      registry.register(provider);
      
      expect(registry.get("test-provider")).toBe(provider);
    });

    it("should return undefined for non-existent provider", () => {
      expect(registry.get("non-existent")).toBeUndefined();
    });
  });

  describe("getProviderForType", () => {
    it("should return provider for registered type", () => {
      const provider = new MockContentProvider("test-provider");
      registry.register(provider);
      
      expect(registry.getProviderForType("test-provider", "page")).toBe(provider);
      expect(registry.getProviderForType("test-provider", "email")).toBe(provider);
    });

    it("should return undefined for non-existent type", () => {
      const provider = new MockContentProvider("test-provider");
      registry.register(provider);
      
      expect(registry.getProviderForType("test-provider", "non-existent")).toBeUndefined();
    });
  });

  describe("list", () => {
    it("should return all registered providers", () => {
      const provider1 = new MockContentProvider("provider1");
      const provider2 = new MockContentProvider("provider2");
      
      registry.register(provider1);
      registry.register(provider2);
      
      const providers = registry.list();
      expect(providers).toHaveLength(2);
      expect(providers).toContain(provider1);
      expect(providers).toContain(provider2);
    });

    it("should return empty array when no providers registered", () => {
      expect(registry.list()).toEqual([]);
    });
  });

  describe("getAllContentTypes", () => {
    it("should return all content types from all providers", () => {
      const provider1 = new MockContentProvider("provider1");
      const provider2 = new MockContentProvider("provider2");
      
      registry.register(provider1);
      registry.register(provider2);
      
      const allTypes = registry.getAllContentTypes();
      
      expect(allTypes).toHaveLength(2);
      expect(allTypes[0]).toEqual({
        provider: "provider1",
        types: provider1.getContentTypes(),
      });
      expect(allTypes[1]).toEqual({
        provider: "provider2",
        types: provider2.getContentTypes(),
      });
    });

    it("should return empty array when no providers registered", () => {
      expect(registry.getAllContentTypes()).toEqual([]);
    });
  });

  describe("clear", () => {
    it("should clear all providers and type mappings", () => {
      const provider1 = new MockContentProvider("provider1");
      const provider2 = new MockContentProvider("provider2");
      
      registry.register(provider1);
      registry.register(provider2);
      
      registry.clear();
      
      expect(registry.list()).toEqual([]);
      expect(registry.has("provider1")).toBe(false);
      expect(registry.has("provider2")).toBe(false);
      expect(registry.getProviderForType("provider1", "page")).toBeUndefined();
    });
  });
});