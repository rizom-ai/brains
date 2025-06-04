import { describe, it, expect } from "bun:test";
import { PluginAssertions } from "../src/assertions";
import type { PluginTool, Plugin, PluginCapabilities } from "@brains/types";
import type { TestEntity } from "../src/test-data";

describe("PluginAssertions", () => {
  describe("assertValidEntity", () => {
    it("should pass for valid entity", () => {
      const entity: TestEntity = {
        id: "123",
        entityType: "note",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        content: "Content",
        title: "Test",
        tags: [],
      };

      // Should not throw
      PluginAssertions.assertValidEntity(entity);
    });

    it("should fail for non-object", () => {
      expect(() => {
        PluginAssertions.assertValidEntity(null);
      }).toThrow("Entity must be an object");

      expect(() => {
        PluginAssertions.assertValidEntity("string");
      }).toThrow("Entity must be an object");
    });

    it("should fail for missing id", () => {
      expect(() => {
        PluginAssertions.assertValidEntity({ entityType: "note" });
      }).toThrow("Entity must have string id");
    });

    it("should fail for missing entityType", () => {
      expect(() => {
        PluginAssertions.assertValidEntity({ id: "123" });
      }).toThrow("Entity must have string entityType");
    });

    it("should fail for missing dates", () => {
      expect(() => {
        PluginAssertions.assertValidEntity({
          id: "123",
          entityType: "note",
          created: new Date().toISOString(),
        });
      }).toThrow("Entity must have updated date");
    });
  });

  describe("assertEntitiesMatch", () => {
    const createEntity = (overrides: Partial<TestEntity> = {}): TestEntity => ({
      id: "123",
      entityType: "note",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      content: "Content",
      title: "Test",
      tags: [],
      ...overrides,
    });

    it("should match entities ignoring default fields", () => {
      const actual = [
        createEntity({ id: "1", title: "A" }),
        createEntity({ id: "2", title: "B" }),
      ];

      const expected: Array<Partial<TestEntity>> = [
        { title: "A", content: "Content" },
        { title: "B", content: "Content" },
      ];

      // Should not throw
      PluginAssertions.assertEntitiesMatch(actual, expected);
    });

    it("should fail on count mismatch", () => {
      const actual = [createEntity()];
      const expected: Array<Partial<TestEntity>> = [
        { title: "A" },
        { title: "B" },
      ];

      expect(() => {
        PluginAssertions.assertEntitiesMatch(actual, expected);
      }).toThrow("Entity count mismatch");
    });

    it("should fail on field mismatch", () => {
      const actual = [createEntity({ title: "A" })];
      const expected: Array<Partial<TestEntity>> = [{ title: "B" }];

      expect(() => {
        PluginAssertions.assertEntitiesMatch(actual, expected);
      }).toThrow("Entity mismatch");
    });

    it("should respect order when orderMatters is true", () => {
      const actual = [
        createEntity({ title: "B" }),
        createEntity({ title: "A" }),
      ];
      const expected: Array<Partial<TestEntity>> = [
        { title: "A" },
        { title: "B" },
      ];

      expect(() => {
        PluginAssertions.assertEntitiesMatch(actual, expected, {
          orderMatters: true,
        });
      }).toThrow("Entity mismatch");
    });

    it("should ignore order when orderMatters is false", () => {
      const actual = [
        createEntity({ title: "B" }),
        createEntity({ title: "A" }),
      ];
      const expected: Array<Partial<TestEntity>> = [
        { title: "A" },
        { title: "B" },
      ];

      // Should not throw (default orderMatters is false)
      PluginAssertions.assertEntitiesMatch(actual, expected);
    });
  });

  describe("assertValidTool", () => {
    it("should pass for valid tool", () => {
      const tool: PluginTool = {
        name: "test_tool",
        description: "Test tool",
        inputSchema: {},
        handler: async () => ({}),
      };

      PluginAssertions.assertValidTool(tool);
    });

    it("should fail for invalid tool", () => {
      expect(() => {
        PluginAssertions.assertValidTool({ name: "test" });
      }).toThrow("Tool must have handler function");

      expect(() => {
        PluginAssertions.assertValidTool({ handler: () => {} });
      }).toThrow("Tool must have string name");
    });
  });

  describe("assertValidPlugin", () => {
    it("should pass for valid plugin", () => {
      const plugin: Plugin = {
        id: "test-plugin",
        name: "Test Plugin",
        version: "1.0.0",
        register: async () =>
          ({ tools: [], resources: [] }) as PluginCapabilities,
      };

      PluginAssertions.assertValidPlugin(plugin);
    });

    it("should fail for invalid plugin", () => {
      expect(() => {
        PluginAssertions.assertValidPlugin({
          id: "test",
          name: "Test",
          version: "1.0.0",
        });
      }).toThrow("Plugin must have register function");
    });
  });

  describe("assertCompletesWithin", () => {
    it("should pass for fast operation", async () => {
      const result = await PluginAssertions.assertCompletesWithin(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "success";
      }, 100);

      expect(result).toBe("success");
    });

    it("should fail for slow operation", async () => {
      expect(
        PluginAssertions.assertCompletesWithin(async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return "too slow";
        }, 100),
      ).rejects.toThrow("Operation timed out");
    });
  });

  describe("assertThrows", () => {
    it("should pass when operation throws", async () => {
      await PluginAssertions.assertThrows(async () => {
        throw new Error("Expected error");
      });
    });

    it("should fail when operation succeeds", async () => {
      let threwError = false;
      try {
        await PluginAssertions.assertThrows(async () => {
          return "success";
        });
      } catch (error) {
        threwError = true;
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain(
          "Expected operation to throw",
        );
      }
      expect(threwError).toBe(true);
    });

    it("should match error message string", async () => {
      await PluginAssertions.assertThrows(async () => {
        throw new Error("Specific error message");
      }, "Specific error");

      expect(
        PluginAssertions.assertThrows(async () => {
          throw new Error("Wrong message");
        }, "Specific error"),
      ).rejects.toThrow("Expected error message to include");
    });

    it("should match error message regex", async () => {
      await PluginAssertions.assertThrows(async () => {
        throw new Error("Error code: 123");
      }, /Error code: \d+/);
    });

    it("should match error type", async () => {
      await PluginAssertions.assertThrows(async () => {
        throw new TypeError("Type error");
      }, TypeError);

      expect(
        PluginAssertions.assertThrows(async () => {
          throw new Error("Regular error");
        }, TypeError),
      ).rejects.toThrow("Expected error to be instance of");
    });
  });
});
