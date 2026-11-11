import { describe, expect, it } from "bun:test";
import { createElement, type ReactElement } from "react";
import type { Plugin, PluginCapabilities } from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import type { SiteContentDefinition } from "../src/definitions";
import { createSiteContentPlugins } from "./site-content-plugins";

const TestLayout = (): ReactElement => createElement("section");

const definition: SiteContentDefinition = {
  namespace: "landing-page",
  sections: {
    hero: {
      description: "Hero section",
      title: "Hero Section",
      layout: TestLayout,
      fields: { headline: { label: "Headline", type: "string" } },
    },
  },
};

async function installed(): Promise<{
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
}> {
  const shell = createMockShell();
  const plugins = createSiteContentPlugins({ definitions: [definition] });
  const capabilities: PluginCapabilities[] = [];
  for (const plugin of plugins) capabilities.push(await plugin.register(shell));
  return { shell, plugins, capabilities };
}

/**
 * What the site-content package registers, pinned as the site-content
 * plugin class registered it: brains call its generate tool by name, site
 * builds read its type's records as each section's saved content, and the
 * section templates its config defines are named by their namespace.
 */
describe("the site-content package's registered surface", () => {
  it("is the site-content service, serving no routes", async () => {
    const { plugins } = await installed();
    const service = plugins.find(({ type }) => type === "service");
    expect([service?.id, service?.packageName]).toEqual([
      "site-content",
      "@brains/site-content",
    ]);
    for (const plugin of plugins) {
      expect(plugin.getWebRoutes?.() ?? []).toEqual([]);
      expect(plugin.getApiRoutes?.() ?? []).toEqual([]);
    }
  });

  it("installs its type apart, under site-content-entity", async () => {
    // The class registered the type inside itself; the declared type is a
    // plugin of its own, and the service keeps the id the class had.
    const { plugins } = await installed();
    expect(plugins.map(({ id, type }) => [id, type])).toEqual([
      ["site-content-entity", "entity"],
      ["site-content", "service"],
    ]);
  });

  it("registers its generate tool and no resources", async () => {
    const { capabilities } = await installed();
    expect(
      capabilities.flatMap(({ tools }) =>
        tools.map((tool) => ({
          name: tool.name,
          visibility: tool.visibility,
          sideEffects: tool.sideEffects,
          input: Object.keys(tool.inputSchema).sort(),
        })),
      ),
    ).toEqual([
      {
        name: "site-content_generate",
        visibility: "admin",
        sideEffects: undefined,
        input: ["dryRun", "force", "routeId", "sectionId"],
      },
    ]);
    expect(capabilities.flatMap(({ resources }) => resources)).toEqual([]);
  });

  it("registers the site-content type, its retired fields read past", async () => {
    const { shell } = await installed();
    const registry = shell.getEntityRegistry();
    expect(registry.hasEntityType("site-content")).toBe(true);
    // Nothing but its retired fields: every other setting is the default,
    // and content is the classification the registry gives a type that
    // names none.
    expect(registry.getEntityTypeConfig("site-content")).toEqual({
      classification: "content",
      retiredFields: ["routeId", "sectionId"],
    });
  });

  it("registers its definitions' section templates under their namespace", async () => {
    const { shell } = await installed();
    const template = shell.getTemplates().get("landing-page:hero");
    expect({
      name: template?.name,
      formatter: template?.formatter !== undefined,
      layout: template?.layout?.component !== undefined,
    }).toEqual({ name: "hero", formatter: true, layout: true });
    expect(
      [...shell.getTemplates().keys()].filter((name) =>
        name.startsWith("site-content:"),
      ),
    ).toEqual([]);
  });
});
