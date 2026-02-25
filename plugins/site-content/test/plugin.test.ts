import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SiteContentPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";

describe("SiteContentPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: SiteContentPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-site-content" });
    plugin = new SiteContentPlugin();
    capabilities = await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  describe("Plugin Registration", () => {
    it("should register plugin with correct metadata", () => {
      expect(plugin.id).toBe("site-content");
      expect(plugin.type).toBe("service");
      expect(plugin.version).toBeDefined();
    });

    it("should register site-content entity type", () => {
      const entityService = harness.getShell().getEntityService();
      const entityTypes = entityService.getEntityTypes();
      expect(entityTypes).toContain("site-content");
    });

    it("should provide generate tool", () => {
      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("site-content_generate");
    });

    it("should not provide any resources", () => {
      expect(capabilities.resources).toEqual([]);
    });
  });
});
