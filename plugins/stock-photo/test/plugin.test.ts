import { describe, it, expect } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { StockPhotoPlugin } from "../src/plugin";

describe("StockPhotoPlugin", () => {
  it("should register with correct metadata", async () => {
    const harness = createPluginHarness();
    const plugin = new StockPhotoPlugin();
    await harness.installPlugin(plugin);

    expect(plugin.id).toBe("stock-photo");
  });

  it("should return no tools when API key is absent", async () => {
    const harness = createPluginHarness();
    const plugin = new StockPhotoPlugin();
    await harness.installPlugin(plugin);

    const { tools } = harness.getCapabilities();
    const stockPhotoTools = tools.filter((t) =>
      t.name.startsWith("stock-photo"),
    );
    expect(stockPhotoTools).toHaveLength(0);
  });

  it("should return tools when API key is provided", async () => {
    const harness = createPluginHarness();
    const plugin = new StockPhotoPlugin({ apiKey: "test-key" });
    await harness.installPlugin(plugin);

    const { tools } = harness.getCapabilities();
    const stockPhotoTools = tools.filter((t) =>
      t.name.startsWith("stock-photo"),
    );
    expect(stockPhotoTools).toHaveLength(2);
    expect(stockPhotoTools.map((t) => t.name).sort()).toEqual([
      "stock-photo_search",
      "stock-photo_select",
    ]);
  });
});
