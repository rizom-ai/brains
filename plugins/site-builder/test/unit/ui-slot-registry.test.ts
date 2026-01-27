import { describe, it, expect, beforeEach } from "bun:test";
import { UISlotRegistry } from "../../src/lib/ui-slot-registry";

// Mock render functions for testing
const mockRender = (): null => null;
const anotherRender = (): null => null;

describe("UISlotRegistry", () => {
  let registry: UISlotRegistry;

  beforeEach(() => {
    registry = new UISlotRegistry();
  });

  describe("register", () => {
    it("should register a render function to a slot", () => {
      registry.register("footer-top", {
        pluginId: "newsletter",
        render: mockRender,
      });

      const slots = registry.getSlot("footer-top");
      expect(slots).toHaveLength(1);
      expect(slots[0]?.pluginId).toBe("newsletter");
      expect(slots[0]?.render).toBe(mockRender);
    });

    it("should register multiple render functions to the same slot", () => {
      registry.register("footer-top", {
        pluginId: "newsletter",
        render: mockRender,
      });
      registry.register("footer-top", {
        pluginId: "social",
        render: anotherRender,
      });

      const slots = registry.getSlot("footer-top");
      expect(slots).toHaveLength(2);
    });

    it("should register with priority", () => {
      registry.register("footer-top", {
        pluginId: "low-priority",
        render: anotherRender,
        priority: 10,
      });
      registry.register("footer-top", {
        pluginId: "high-priority",
        render: mockRender,
        priority: 100,
      });

      const slots = registry.getSlot("footer-top");
      // Higher priority should come first
      expect(slots[0]?.pluginId).toBe("high-priority");
      expect(slots[1]?.pluginId).toBe("low-priority");
    });

    it("should use default priority of 50", () => {
      registry.register("footer-top", {
        pluginId: "default",
        render: mockRender,
      });

      const slots = registry.getSlot("footer-top");
      expect(slots[0]?.priority).toBe(50);
    });
  });

  describe("getSlot", () => {
    it("should return empty array for unregistered slot", () => {
      const slots = registry.getSlot("nonexistent");
      expect(slots).toEqual([]);
    });

    it("should return slots sorted by priority (highest first)", () => {
      registry.register("sidebar", {
        pluginId: "a",
        render: mockRender,
        priority: 20,
      });
      registry.register("sidebar", {
        pluginId: "b",
        render: mockRender,
        priority: 80,
      });
      registry.register("sidebar", {
        pluginId: "c",
        render: mockRender,
        priority: 50,
      });

      const slots = registry.getSlot("sidebar");
      expect(slots.map((s) => s.pluginId)).toEqual(["b", "c", "a"]);
    });
  });

  describe("hasSlot", () => {
    it("should return false for empty slot", () => {
      expect(registry.hasSlot("footer-top")).toBe(false);
    });

    it("should return true for registered slot", () => {
      registry.register("footer-top", {
        pluginId: "newsletter",
        render: mockRender,
      });

      expect(registry.hasSlot("footer-top")).toBe(true);
    });
  });

  describe("unregister", () => {
    it("should remove a specific plugin's registration from a slot", () => {
      registry.register("footer-top", {
        pluginId: "newsletter",
        render: mockRender,
      });
      registry.register("footer-top", {
        pluginId: "social",
        render: anotherRender,
      });

      registry.unregister("footer-top", "newsletter");

      const slots = registry.getSlot("footer-top");
      expect(slots).toHaveLength(1);
      expect(slots[0]?.pluginId).toBe("social");
    });

    it("should do nothing if plugin not registered to slot", () => {
      registry.register("footer-top", {
        pluginId: "newsletter",
        render: mockRender,
      });

      registry.unregister("footer-top", "nonexistent");

      const slots = registry.getSlot("footer-top");
      expect(slots).toHaveLength(1);
    });
  });

  describe("unregisterAll", () => {
    it("should remove all registrations for a plugin", () => {
      registry.register("footer-top", {
        pluginId: "newsletter",
        render: mockRender,
      });
      registry.register("sidebar", {
        pluginId: "newsletter",
        render: anotherRender,
      });
      registry.register("footer-top", {
        pluginId: "other",
        render: mockRender,
      });

      registry.unregisterAll("newsletter");

      const remaining = registry.getSlot("footer-top");
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.pluginId).toBe("other");
      expect(registry.getSlot("sidebar")).toHaveLength(0);
    });
  });

  describe("getSlotNames", () => {
    it("should return all registered slot names", () => {
      registry.register("footer-top", {
        pluginId: "a",
        render: mockRender,
      });
      registry.register("sidebar", { pluginId: "b", render: mockRender });
      registry.register("header", { pluginId: "c", render: mockRender });

      const names = registry.getSlotNames();
      expect(names).toContain("footer-top");
      expect(names).toContain("sidebar");
      expect(names).toContain("header");
      expect(names).toHaveLength(3);
    });
  });

  describe("clear", () => {
    it("should remove all registrations", () => {
      registry.register("footer-top", {
        pluginId: "a",
        render: mockRender,
      });
      registry.register("sidebar", { pluginId: "b", render: mockRender });

      registry.clear();

      expect(registry.getSlotNames()).toHaveLength(0);
      expect(registry.hasSlot("footer-top")).toBe(false);
    });
  });
});
