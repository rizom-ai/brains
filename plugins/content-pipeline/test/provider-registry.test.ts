import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ProviderRegistry } from "../src/provider-registry";
import type { PublishProvider } from "@brains/utils";

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = ProviderRegistry.createFresh();
  });

  const createMockProvider = (name: string): PublishProvider => ({
    name,
    publish: async () => ({ id: `${name}-result` }),
  });

  describe("register", () => {
    it("should register a provider for entity type", () => {
      const provider = createMockProvider("linkedin");

      registry.register("social-post", provider);

      expect(registry.get("social-post")).toBe(provider);
    });

    it("should override existing provider", () => {
      const provider1 = createMockProvider("provider1");
      const provider2 = createMockProvider("provider2");

      registry.register("social-post", provider1);
      registry.register("social-post", provider2);

      expect(registry.get("social-post")).toBe(provider2);
    });
  });

  describe("get", () => {
    it("should return registered provider", () => {
      const provider = createMockProvider("linkedin");
      registry.register("social-post", provider);

      expect(registry.get("social-post")).toBe(provider);
    });

    it("should return default provider for unregistered type", () => {
      const provider = registry.get("blog-post");

      expect(provider.name).toBe("internal");
    });
  });

  describe("has", () => {
    it("should return true for registered type", () => {
      const provider = createMockProvider("linkedin");
      registry.register("social-post", provider);

      expect(registry.has("social-post")).toBe(true);
    });

    it("should return false for unregistered type", () => {
      expect(registry.has("unknown")).toBe(false);
    });
  });

  describe("unregister", () => {
    it("should remove registered provider", () => {
      const provider = createMockProvider("linkedin");
      registry.register("social-post", provider);

      registry.unregister("social-post");

      expect(registry.has("social-post")).toBe(false);
    });
  });

  describe("getRegisteredTypes", () => {
    it("should return all registered entity types", () => {
      registry.register("social-post", createMockProvider("linkedin"));
      registry.register("blog-post", createMockProvider("blog"));

      const types = registry.getRegisteredTypes();

      expect(types).toContain("social-post");
      expect(types).toContain("blog-post");
    });
  });

  describe("default provider", () => {
    it("should return internal provider for all unregistered types", async () => {
      const provider = registry.get("any-type");

      expect(provider.name).toBe("internal");
      const result = await provider.publish("content", {});
      expect(result.id).toBe("internal");
    });
  });

  describe("singleton pattern", () => {
    it("should return same instance from getInstance", () => {
      const instance1 = ProviderRegistry.getInstance();
      const instance2 = ProviderRegistry.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("should return fresh instance after reset", () => {
      const instance1 = ProviderRegistry.getInstance();
      ProviderRegistry.resetInstance();
      const instance2 = ProviderRegistry.getInstance();

      expect(instance1).not.toBe(instance2);
    });

    afterEach(() => {
      ProviderRegistry.resetInstance();
    });
  });
});
