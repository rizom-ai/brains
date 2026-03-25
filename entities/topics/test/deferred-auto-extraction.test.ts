import { describe, it, expect } from "bun:test";
import { TopicsPlugin } from "../src";
import { createPluginHarness } from "@brains/plugins/test";

describe("Deferred Auto-Extraction", () => {
  describe("isAutoExtractionEnabled", () => {
    it("should return false initially when config enables auto-extraction", () => {
      const plugin = new TopicsPlugin({ enableAutoExtraction: true });
      expect(plugin.isAutoExtractionEnabled()).toBe(false);
    });

    it("should return false initially when config disables auto-extraction", () => {
      const plugin = new TopicsPlugin({ enableAutoExtraction: false });
      expect(plugin.isAutoExtractionEnabled()).toBe(false);
    });
  });

  describe("enableAutoExtraction", () => {
    it("should set autoExtractionEnabled to true", () => {
      const plugin = new TopicsPlugin({ enableAutoExtraction: true });
      expect(plugin.isAutoExtractionEnabled()).toBe(false);

      plugin.enableAutoExtraction();

      expect(plugin.isAutoExtractionEnabled()).toBe(true);
    });
  });

  describe("sync:initial:completed event", () => {
    it("should enable auto-extraction after sync completes when config allows", async () => {
      const harness = createPluginHarness<TopicsPlugin>({});
      const plugin = new TopicsPlugin({ enableAutoExtraction: true });

      await harness.installPlugin(plugin);

      expect(plugin.isAutoExtractionEnabled()).toBe(false);

      await harness.sendMessage(
        "sync:initial:completed",
        { success: true },
        "directory-sync",
      );

      expect(plugin.isAutoExtractionEnabled()).toBe(true);

      harness.reset();
    });

    it("should NOT enable auto-extraction after sync when config disables it", async () => {
      const harness = createPluginHarness<TopicsPlugin>({});
      const plugin = new TopicsPlugin({ enableAutoExtraction: false });

      await harness.installPlugin(plugin);

      await harness.sendMessage(
        "sync:initial:completed",
        { success: true },
        "directory-sync",
      );

      expect(plugin.isAutoExtractionEnabled()).toBe(false);

      harness.reset();
    });
  });

  describe("when enableAutoExtraction config is false", () => {
    it("should never enable auto-extraction regardless of sync events", async () => {
      const harness = createPluginHarness<TopicsPlugin>({});
      const plugin = new TopicsPlugin({ enableAutoExtraction: false });

      await harness.installPlugin(plugin);

      plugin.enableAutoExtraction();

      expect(plugin.isAutoExtractionEnabled()).toBe(false);

      harness.reset();
    });
  });
});
