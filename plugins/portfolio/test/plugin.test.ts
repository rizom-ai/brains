import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { PortfolioPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";

describe("PortfolioPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: PortfolioPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });

    plugin = new PortfolioPlugin({});
    capabilities = await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  describe("Plugin Registration", () => {
    it("should register plugin with correct metadata", () => {
      expect(plugin.id).toBe("portfolio");
      expect(plugin.type).toBe("service");
      expect(plugin.version).toBeDefined();
    });

    it("should not provide tools (entity creation via system_create)", () => {
      expect(capabilities.tools).toHaveLength(0);
    });

    it("should not provide any resources", () => {
      expect(capabilities.resources).toEqual([]);
    });
  });
});
