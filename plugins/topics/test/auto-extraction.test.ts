import { describe, it, expect } from "bun:test";
import { TopicsPlugin } from "../src";

describe("Auto-extraction configuration", () => {
  it("should have auto-extraction enabled by default", () => {
    const plugin = new TopicsPlugin();
    expect(plugin.config.enableAutoExtraction).toBe(true);
  });

  it("should allow disabling auto-extraction", () => {
    const plugin = new TopicsPlugin({
      enableAutoExtraction: false,
    });
    expect(plugin.config.enableAutoExtraction).toBe(false);
  });

  it("should configure auto-merge settings", () => {
    const plugin = new TopicsPlugin({
      enableAutoExtraction: true,
      autoMerge: true,
      mergeSimilarityThreshold: 0.85,
    });
    expect(plugin.config.autoMerge).toBe(true);
    expect(plugin.config.mergeSimilarityThreshold).toBe(0.85);
  });

  it("should use default window size", () => {
    const plugin = new TopicsPlugin();
    expect(plugin.config.windowSize).toBe(30);
  });

  it("should allow custom window size", () => {
    const plugin = new TopicsPlugin({
      windowSize: 50,
    });
    expect(plugin.config.windowSize).toBe(50);
  });
});
