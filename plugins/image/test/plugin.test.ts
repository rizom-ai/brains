import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ImagePlugin } from "../src/image-plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";

describe("ImagePlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: ImagePlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-image" });
    plugin = new ImagePlugin();
    capabilities = await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  describe("Plugin Registration", () => {
    it("should register plugin with correct metadata", () => {
      expect(plugin.id).toBe("image");
      expect(plugin.type).toBe("service");
      expect(plugin.version).toBeDefined();
    });

    it("should provide image tools", () => {
      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("image_upload");
      expect(toolNames).toContain("image_generate");
      expect(toolNames).toContain("image_set-cover");
    });

    it("should not provide any resources", () => {
      expect(capabilities.resources).toEqual([]);
    });
  });
});
