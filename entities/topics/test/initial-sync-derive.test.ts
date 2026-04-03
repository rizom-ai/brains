import { describe, it, expect } from "bun:test";
import { TopicsPlugin } from "../src";
import { createPluginHarness } from "@brains/plugins/test";

describe("Initial sync triggers batch deriveAll", () => {
  it("should run deriveAll after sync:initial:completed", async () => {
    const harness = createPluginHarness<TopicsPlugin>({});
    const plugin = new TopicsPlugin({
      enableAutoExtraction: true,
      includeEntityTypes: ["post"],
    });

    await harness.installPlugin(plugin);

    expect(plugin.hasRunInitialDerivation()).toBe(false);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );

    expect(plugin.hasRunInitialDerivation()).toBe(true);
    expect(plugin.isAutoExtractionEnabled()).toBe(true);

    harness.reset();
  });

  it("should not run deriveAll when auto-extraction is disabled", async () => {
    const harness = createPluginHarness<TopicsPlugin>({});
    const plugin = new TopicsPlugin({ enableAutoExtraction: false });

    await harness.installPlugin(plugin);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );

    expect(plugin.hasRunInitialDerivation()).toBe(false);

    harness.reset();
  });

  it("should only run deriveAll once across multiple sync events", async () => {
    const harness = createPluginHarness<TopicsPlugin>({});
    const plugin = new TopicsPlugin({
      enableAutoExtraction: true,
      includeEntityTypes: ["post"],
    });

    await harness.installPlugin(plugin);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );
    expect(plugin.hasRunInitialDerivation()).toBe(true);

    // Second sync should not re-trigger (flag stays true, no error)
    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );
    expect(plugin.hasRunInitialDerivation()).toBe(true);

    harness.reset();
  });
});
