import { describe, expect, it } from "bun:test";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import type { PluginCapabilities } from "@brains/plugins";
import stockPhotoPackage from "../src";

const METADATA = { name: "@brains/stock-photo", version: "0.1.0" };

async function installed(
  config: Record<string, unknown>,
): Promise<{ id: string; capabilities: PluginCapabilities }> {
  const harness = createPluginHarness({
    logger: createSilentLogger("stock-photo"),
  });
  const [plugin] = instantiatePluginPackageDefinition(
    stockPhotoPackage,
    config,
    METADATA,
  );
  if (!plugin) throw new Error("Stock photo plugin was not created");
  const capabilities = await harness.installPlugin(plugin);
  return { id: plugin.id, capabilities };
}

const stockPhotoTools = (capabilities: PluginCapabilities): string[] =>
  capabilities.tools
    .map((tool) => tool.name)
    .filter((name) => name.startsWith("stock-photo"))
    .sort();

describe("stock-photo package", () => {
  it("registers under its package-scoped id", async () => {
    const { id } = await installed({});
    expect(id).toBe("@brains/stock-photo:stock-photo");
  });

  it("offers nothing without a provider key", async () => {
    // No key means no provider; a tool that could only answer "not
    // configured" is noise in the agent's tool list.
    const { capabilities } = await installed({});
    expect(stockPhotoTools(capabilities)).toEqual([]);
  });

  it("offers search and select once a key is configured", async () => {
    const { capabilities } = await installed({ apiKey: "test-key" });
    expect(stockPhotoTools(capabilities)).toEqual([
      "stock-photo_search",
      "stock-photo_select",
    ]);
  });
});
