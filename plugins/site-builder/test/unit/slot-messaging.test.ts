import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SiteBuilderPlugin } from "../../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import { createTestConfig } from "../test-helpers";

describe("Site-builder slot messaging", () => {
  let harness: ReturnType<typeof createPluginHarness<SiteBuilderPlugin>>;
  let plugin: SiteBuilderPlugin;

  beforeEach(async () => {
    harness = createPluginHarness<SiteBuilderPlugin>();
    plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        productionOutputDir: "/tmp/test-output-production",
      }),
    );
    await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  describe("slot:register message handling", () => {
    it("should collect slot registrations from messages", async () => {
      // Simulate a plugin sending a slot registration
      await harness.sendMessage("plugin:site-builder:slot:register", {
        pluginId: "newsletter",
        slotName: "footer-top",
        render: (): null => null,
      });

      // Get the slot registry from site-builder
      const slotRegistry = plugin.getSlotRegistry();
      expect(slotRegistry).toBeDefined();
      expect(slotRegistry?.hasSlot("footer-top")).toBe(true);
    });

    it("should collect multiple slot registrations", async () => {
      await harness.sendMessage("plugin:site-builder:slot:register", {
        pluginId: "newsletter",
        slotName: "footer-top",
        render: (): null => null,
      });

      await harness.sendMessage("plugin:site-builder:slot:register", {
        pluginId: "social",
        slotName: "footer-top",
        render: (): null => null,
        priority: 100,
      });

      const slotRegistry = plugin.getSlotRegistry();
      const footerSlots = slotRegistry?.getSlot("footer-top");
      expect(footerSlots).toHaveLength(2);
    });

    it("should preserve priority from registration", async () => {
      await harness.sendMessage("plugin:site-builder:slot:register", {
        pluginId: "low-priority",
        slotName: "footer-top",
        render: (): null => null,
        priority: 10,
      });

      await harness.sendMessage("plugin:site-builder:slot:register", {
        pluginId: "high-priority",
        slotName: "footer-top",
        render: (): null => null,
        priority: 100,
      });

      const slotRegistry = plugin.getSlotRegistry();
      const footerSlots = slotRegistry?.getSlot("footer-top");

      // Higher priority should come first
      expect(footerSlots?.[0]?.pluginId).toBe("high-priority");
      expect(footerSlots?.[1]?.pluginId).toBe("low-priority");
    });

    it("should handle registrations for different slots", async () => {
      await harness.sendMessage("plugin:site-builder:slot:register", {
        pluginId: "newsletter",
        slotName: "footer-top",
        render: (): null => null,
      });

      await harness.sendMessage("plugin:site-builder:slot:register", {
        pluginId: "widgets",
        slotName: "sidebar",
        render: (): null => null,
      });

      const slotRegistry = plugin.getSlotRegistry();
      expect(slotRegistry?.hasSlot("footer-top")).toBe(true);
      expect(slotRegistry?.hasSlot("sidebar")).toBe(true);
      expect(slotRegistry?.getSlot("footer-top")).toHaveLength(1);
      expect(slotRegistry?.getSlot("sidebar")).toHaveLength(1);
    });
  });
});
