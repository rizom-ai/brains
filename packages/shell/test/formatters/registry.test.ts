import { describe, expect, it, beforeEach, mock } from "bun:test";
import { SchemaFormatterRegistry } from "@/formatters/registry";
import { DefaultSchemaFormatter } from "@/formatters/default";
import type { SchemaFormatter } from "@brains/types";
import { createSilentLogger } from "@personal-brain/utils";

describe("SchemaFormatterRegistry", () => {
  let registry: SchemaFormatterRegistry;
  let defaultFormatter: SchemaFormatter;
  let logger: ReturnType<typeof createSilentLogger>;

  beforeEach(() => {
    // Reset singleton
    SchemaFormatterRegistry.resetInstance();
    
    defaultFormatter = new DefaultSchemaFormatter();
    logger = createSilentLogger();
    
    registry = SchemaFormatterRegistry.createFresh({
      defaultFormatter,
      logger,
    });
  });

  describe("register", () => {
    it("should register a formatter", () => {
      const mockFormatter: SchemaFormatter = {
        format: mock(() => "formatted"),
        canFormat: mock(() => true),
      };

      registry.register("test", mockFormatter);
      expect(registry.hasFormatter("test")).toBe(true);
    });

    it("should override existing formatter", () => {
      const formatter1: SchemaFormatter = {
        format: () => "formatter1",
        canFormat: () => true,
      };
      const formatter2: SchemaFormatter = {
        format: () => "formatter2",
        canFormat: () => true,
      };

      registry.register("test", formatter1);
      registry.register("test", formatter2);

      const result = registry.getFormatter("test");
      expect(result?.format("data")).toBe("formatter2");
    });
  });

  describe("format", () => {
    it("should use specific formatter when schemaName provided", () => {
      const mockFormatter: SchemaFormatter = {
        format: mock(() => "specific format"),
        canFormat: mock(() => true),
      };

      registry.register("custom", mockFormatter);
      const result = registry.format({ data: "test" }, "custom");

      expect(result).toBe("specific format");
      expect(mockFormatter.format).toHaveBeenCalledWith({ data: "test" });
    });

    it("should find formatter by canFormat when no schemaName", () => {
      const formatter1: SchemaFormatter = {
        format: () => "formatter1",
        canFormat: (data) => data === "type1",
      };
      const formatter2: SchemaFormatter = {
        format: () => "formatter2",
        canFormat: (data) => data === "type2",
      };

      registry.register("fmt1", formatter1);
      registry.register("fmt2", formatter2);

      expect(registry.format("type1")).toBe("formatter1");
      expect(registry.format("type2")).toBe("formatter2");
    });

    it("should use default formatter when no match", () => {
      const formatter: SchemaFormatter = {
        format: () => "custom",
        canFormat: () => false,
      };

      registry.register("custom", formatter);
      const result = registry.format({ message: "default" });

      expect(result).toBe("default");
    });

    it("should handle unknown schemaName gracefully", () => {
      const result = registry.format({ message: "test" }, "nonexistent");
      expect(result).toBe("test");
    });
  });

  describe("getFormatter", () => {
    it("should return formatter by name", () => {
      const mockFormatter: SchemaFormatter = {
        format: () => "test",
        canFormat: () => true,
      };

      registry.register("test", mockFormatter);
      const result = registry.getFormatter("test");

      expect(result).toBe(mockFormatter);
    });

    it("should return null for unknown formatter", () => {
      const result = registry.getFormatter("unknown");
      expect(result).toBe(null);
    });
  });

  describe("hasFormatter", () => {
    it("should return true for registered formatter", () => {
      const mockFormatter: SchemaFormatter = {
        format: () => "test",
        canFormat: () => true,
      };

      registry.register("test", mockFormatter);
      expect(registry.hasFormatter("test")).toBe(true);
    });

    it("should return false for unknown formatter", () => {
      expect(registry.hasFormatter("unknown")).toBe(false);
    });
  });

  describe("unregister", () => {
    it("should remove formatter", () => {
      const mockFormatter: SchemaFormatter = {
        format: () => "test",
        canFormat: () => true,
      };

      registry.register("test", mockFormatter);
      expect(registry.hasFormatter("test")).toBe(true);

      registry.unregister("test");
      expect(registry.hasFormatter("test")).toBe(false);
    });

    it("should handle unregistering non-existent formatter", () => {
      // Should not throw
      expect(() => registry.unregister("unknown")).not.toThrow();
    });
  });

  describe("getRegisteredSchemas", () => {
    it("should return empty array when no formatters", () => {
      expect(registry.getRegisteredSchemas()).toEqual([]);
    });

    it("should return all registered schema names", () => {
      registry.register("schema1", defaultFormatter);
      registry.register("schema2", defaultFormatter);
      registry.register("schema3", defaultFormatter);

      const schemas = registry.getRegisteredSchemas();
      expect(schemas).toHaveLength(3);
      expect(schemas).toContain("schema1");
      expect(schemas).toContain("schema2");
      expect(schemas).toContain("schema3");
    });
  });

  describe("setDefaultFormatter", () => {
    it("should update default formatter", () => {
      const newDefault: SchemaFormatter = {
        format: () => "new default",
        canFormat: () => true,
      };

      registry.setDefaultFormatter(newDefault);
      
      // Test that new default is used
      const result = registry.format("test");
      expect(result).toBe("new default");
    });
  });

  describe("singleton pattern", () => {
    it("should return same instance", () => {
      const instance1 = SchemaFormatterRegistry.getInstance({
        defaultFormatter,
        logger,
      });
      const instance2 = SchemaFormatterRegistry.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it("should throw when getInstance called without dependencies first time", () => {
      SchemaFormatterRegistry.resetInstance();
      expect(() => SchemaFormatterRegistry.getInstance()).toThrow(
        "Default formatter required for first initialization"
      );
    });
  });
});