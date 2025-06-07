import { describe, it, expect, beforeEach } from "bun:test";
import { z } from "zod";
import { ContentTypeRegistry } from "../../src/content/contentTypeRegistry";

describe("ContentTypeRegistry", () => {
  let registry: ContentTypeRegistry;

  beforeEach(() => {
    registry = ContentTypeRegistry.createFresh();
  });

  describe("Registration", () => {
    it("should register a schema for a content type", () => {
      const schema = z.object({ title: z.string() });
      
      expect(() => 
        registry.register("plugin:test:hero", schema)
      ).not.toThrow();
    });

    it("should require namespaced content types", () => {
      const schema = z.object({ title: z.string() });
      
      expect(() => 
        registry.register("hero", schema)
      ).toThrow('Content type must be namespaced');
    });

    it("should overwrite existing schema when registering same content type", () => {
      const schema1 = z.object({ title: z.string() });
      const schema2 = z.object({ name: z.string() });
      
      registry.register("plugin:test:hero", schema1);
      registry.register("plugin:test:hero", schema2);
      
      const retrieved = registry.get("plugin:test:hero");
      expect(retrieved).toBe(schema2);
    });
  });

  describe("Retrieval", () => {
    it("should retrieve registered schema", () => {
      const schema = z.object({ title: z.string() });
      registry.register("plugin:test:hero", schema);
      
      const retrieved = registry.get("plugin:test:hero");
      expect(retrieved).toBe(schema);
    });

    it("should return null for unregistered content type", () => {
      const retrieved = registry.get("plugin:test:unknown");
      expect(retrieved).toBeNull();
    });
  });


  describe("Listing", () => {
    beforeEach(() => {
      registry.register("webserver:landing:hero", z.object({}));
      registry.register("webserver:landing:features", z.object({}));
      registry.register("webserver:dashboard:stats", z.object({}));
      registry.register("blog:post:content", z.object({}));
      registry.register("blog:post:metadata", z.object({}));
    });

    it("should list all registered content types", () => {
      const types = registry.list();
      
      expect(types).toHaveLength(5);
      expect(types).toContain("webserver:landing:hero");
      expect(types).toContain("blog:post:content");
    });

    it("should filter by namespace", () => {
      const webserverTypes = registry.list("webserver");
      
      expect(webserverTypes).toHaveLength(3);
      expect(webserverTypes).toContain("webserver:landing:hero");
      expect(webserverTypes).toContain("webserver:dashboard:stats");
      expect(webserverTypes).not.toContain("blog:post:content");
    });

    it("should return empty array for unknown namespace", () => {
      const types = registry.list("unknown");
      expect(types).toHaveLength(0);
    });
  });

  describe("Utility Methods", () => {
    it("should check if content type is registered", () => {
      const schema = z.object({ title: z.string() });
      registry.register("plugin:test:hero", schema);
      
      expect(registry.has("plugin:test:hero")).toBe(true);
      expect(registry.has("plugin:test:unknown")).toBe(false);
    });

    it("should clear all registered schemas", () => {
      registry.register("plugin:test:one", z.object({}));
      registry.register("plugin:test:two", z.object({}));
      
      expect(registry.list()).toHaveLength(2);
      
      registry.clear();
      
      expect(registry.list()).toHaveLength(0);
    });
  });
});