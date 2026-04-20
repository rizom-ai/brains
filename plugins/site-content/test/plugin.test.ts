import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SiteContentPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";
import type { SiteContentDefinition } from "../src/definitions";

const TestLayout = (): never => null as never;

const definition: SiteContentDefinition = {
  namespace: "landing-page",
  sections: {
    hero: {
      description: "Hero section",
      title: "Hero Section",
      layout: TestLayout,
      fields: {
        headline: { label: "Headline", type: "string" },
      },
    },
  },
};

describe("SiteContentPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: SiteContentPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-site-content" });
    plugin = new SiteContentPlugin({ definitions: [definition] });
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
      const entityService = harness.getEntityService();
      const entityTypes = entityService.getEntityTypes();
      expect(entityTypes).toContain("site-content");
    });

    it("should register namespaced templates from site-content definitions", () => {
      const template = harness.getTemplates().get("landing-page:hero");
      expect(template).toBeDefined();
      expect(template?.name).toBe("hero");
      expect(template?.formatter).toBeDefined();
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
