import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createElement } from "react";
import type { ReactElement } from "react";
import type { Plugin, PluginCapabilities } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import type { SiteContentDefinition } from "../src/definitions";
import { installSiteContent, SECTIONS_PLUGIN_ID } from "./helpers/install";

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

describe("site content", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: Plugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-site-content" });
    const installed = await installSiteContent(harness, {
      definitions: [definition],
    });
    plugin = installed.service;
    capabilities = installed.capabilities;
  });

  afterEach(async () => {
    await harness.reset();
  });

  it("installs as one declared service", () => {
    expect(plugin.id).toBe(SECTIONS_PLUGIN_ID);
    expect(plugin.type).toBe("service");
    expect(plugin.version).toBeDefined();
  });

  it("owns the site-content entity type", () => {
    expect(harness.getEntityService().getEntityTypes()).toContain(
      "site-content",
    );
  });

  /**
   * The section belongs to the site a brain composed, so a route names it by
   * the namespace its author chose rather than by this package's id.
   */
  it("registers each configured section under its own namespace", () => {
    const template = harness.getTemplates().get("landing-page:hero");

    expect(template?.name).toBe("hero");
    expect(template?.requiredPermission).toBe("public");
    expect(template?.formatter).toBeDefined();
  });

  it("reads a section back as the value it was written from", () => {
    const template = harness.getTemplates().get("landing-page:hero");
    if (!template?.formatter)
      throw new Error("The hero section has no formatter");

    const markdown = template.formatter.format({ headline: "Welcome" });

    expect(template.formatter.parse(markdown)).toEqual({
      headline: "Welcome",
    });
  });

  it("offers one tool, for filling sections in", () => {
    expect(capabilities.tools.map((tool) => tool.name)).toEqual([
      "sections_generate",
    ]);
  });

  it("offers no resources", () => {
    expect(capabilities.resources).toEqual([]);
  });
});
