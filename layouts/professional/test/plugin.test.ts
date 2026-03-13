import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { ProfessionalSitePlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";

describe("ProfessionalSitePlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: ProfessionalSitePlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });

    plugin = new ProfessionalSitePlugin({
      entityRouteConfig: {
        post: { label: "Essay" },
        deck: { label: "Presentation" },
      },
    });
    capabilities = await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  describe("Plugin Registration", () => {
    it("should register plugin with correct metadata", () => {
      expect(plugin.id).toBe("professional-site");
      expect(plugin.type).toBe("service");
      expect(plugin.version).toBeDefined();
    });

    it("should declare dependencies on blog and decks", () => {
      expect(plugin.dependencies).toContain("blog");
      expect(plugin.dependencies).toContain("decks");
    });

    it("should not provide any tools", () => {
      expect(capabilities.tools).toEqual([]);
    });

    it("should not provide any resources", () => {
      expect(capabilities.resources).toEqual([]);
    });
  });

  describe("Configuration", () => {
    it("should accept entity route config", () => {
      const customPlugin = new ProfessionalSitePlugin({
        entityRouteConfig: {
          post: { label: "Blog Post", pluralName: "blog-posts" },
          deck: { label: "Slide Deck", pluralName: "slide-decks" },
        },
      });

      expect(customPlugin.id).toBe("professional-site");
    });
  });
});
