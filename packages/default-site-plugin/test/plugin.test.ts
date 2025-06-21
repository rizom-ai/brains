import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DefaultSitePlugin } from "../src/plugin";
import { PluginTestHarness } from "@brains/utils";

describe("DefaultSitePlugin", () => {
  let harness: PluginTestHarness;
  let plugin: DefaultSitePlugin;

  beforeEach(async () => {
    harness = new PluginTestHarness();
    plugin = new DefaultSitePlugin();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("should register successfully", async () => {
    // Should not throw when installing
    await harness.installPlugin(plugin);
    // If we get here without throwing, the test passes
  });

  it("should have correct plugin metadata", () => {
    expect(plugin.id).toBe("default-site");
    expect(plugin.name).toBe("Default Site Plugin");
    expect(plugin.description).toBe(
      "Provides default website structure and content templates",
    );
  });

  it("should provide no tools", async () => {
    await harness.installPlugin(plugin);
    const context = harness.getPluginContext();
    const capabilities = await plugin.register(context);

    expect(capabilities.tools).toEqual([]);
  });

  it("should provide no resources", async () => {
    await harness.installPlugin(plugin);
    const context = harness.getPluginContext();
    const capabilities = await plugin.register(context);

    expect(capabilities.resources).toEqual([]);
  });

  // TODO: Add tests for page registration once plugin context supports pages
});
