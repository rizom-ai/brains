import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createElement } from "react";
import type { ReactElement } from "react";
import type { Plugin } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSiteContentPlugins } from "./site-content-plugins";
import type { SiteContentDefinition } from "../src/definitions";

// A real component: `layout` is typed to return a JSX element, so a stub that
// returns null only fits by asserting the null away.
const TestLayout = (): ReactElement => createElement("section");

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
  let plugin: Plugin;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-site-content" });
    const plugins = createSiteContentPlugins({ definitions: [definition] });
    for (const installed of plugins) await harness.installPlugin(installed);
    const service = plugins.find(({ type }) => type === "service");
    if (!service) throw new Error("No site-content service");
    plugin = service;
  });

  afterEach(async () => {
    await harness.reset();
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
      const toolNames = harness.getCapabilities().tools.map((t) => t.name);
      expect(toolNames).toContain("site-content_generate");
    });

    it("should not provide any resources", () => {
      expect(harness.getCapabilities().resources).toEqual([]);
    });
  });
});
