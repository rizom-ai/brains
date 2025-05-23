import { describe, expect, it, beforeEach } from "bun:test";
import { z } from "zod";
import { SchemaRegistry } from "@/schema/schemaRegistry";
import { Logger } from "@/utils/logger";

describe("SchemaRegistry", () => {
  let registry: SchemaRegistry;

  beforeEach(() => {
    const logger = Logger.createFresh();
    registry = SchemaRegistry.createFresh(logger);
  });

  describe("schema operations", () => {
    const userSchema = z.object({
      name: z.string(),
      email: z.string().email(),
    });

    it("should store and retrieve schemas", () => {
      registry.register("user", userSchema);
      
      const retrieved = registry.get("user");
      expect(retrieved).toBeDefined();
      expect(registry.has("user")).toBe(true);
    });

    it("should validate data against stored schemas", () => {
      registry.register("user", userSchema);
      
      const validResult = registry.validate("user", {
        name: "John Doe",
        email: "john@example.com",
      });
      
      expect(validResult.success).toBe(true);
      if (validResult.success) {
        expect(validResult.data).toEqual({
          name: "John Doe",
          email: "john@example.com",
        });
      }
    });

    it("should return validation errors for invalid data", () => {
      registry.register("user", userSchema);
      
      const invalidResult = registry.validate("user", {
        name: "John Doe",
        email: "not-an-email",
      });
      
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.error.issues[0]?.path).toEqual(["email"]);
      }
    });

    it("should throw when validating with non-existent schema", () => {
      expect(() => {
        registry.validate("nonexistent", {});
      }).toThrow("Schema 'nonexistent' not found");
    });

    it("should list all registered schema names", () => {
      registry.register("user", userSchema);
      registry.register("post", z.object({ title: z.string() }));
      
      const names = registry.getSchemaNames();
      expect(names).toContain("user");
      expect(names).toContain("post");
      expect(names).toHaveLength(2);
    });

    it("should allow removing schemas", () => {
      registry.register("temp", z.string());
      
      expect(registry.has("temp")).toBe(true);
      registry.remove("temp");
      expect(registry.has("temp")).toBe(false);
    });

    it("should clear all schemas", () => {
      registry.register("schema1", z.string());
      registry.register("schema2", z.number());
      
      registry.clear();
      expect(registry.getSchemaNames()).toHaveLength(0);
    });
  });
});