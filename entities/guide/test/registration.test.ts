import { describe, expect, it } from "bun:test";
import type { Plugin, PluginCapabilities } from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import { createGuidePlugins } from "./guide-plugins";

interface Installed {
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
}

async function installed(): Promise<Installed> {
  const shell = createMockShell();
  const plugins = createGuidePlugins();
  const capabilities: PluginCapabilities[] = [];
  for (const plugin of plugins) {
    capabilities.push(await plugin.register(shell));
  }
  return { shell, plugins, capabilities };
}

/**
 * What the guide package registers, pinned as the guides entity plugin class
 * registered it: brains answer guide questions from the guide type and its
 * instructions, and docs sites render the guides through these templates and
 * data sources.
 */
describe("the guide package's registered surface", () => {
  it("is the guides plugin, with no tools, resources, routes or jobs", async () => {
    const { shell, plugins, capabilities } = await installed();
    expect(
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]),
    ).toEqual([["guides", "entity", "@brains/guide", []]]);
    expect(capabilities.flatMap(({ tools }) => tools)).toEqual([]);
    expect(capabilities.flatMap(({ resources }) => resources)).toEqual([]);
    for (const plugin of plugins) {
      expect(plugin.getWebRoutes?.() ?? []).toEqual([]);
      expect(plugin.getApiRoutes?.() ?? []).toEqual([]);
    }
    expect(shell.getJobQueueService().getRegisteredTypes()).toEqual([]);
  });

  it("registers guides as primary reference content", async () => {
    const { shell } = await installed();
    const registry = shell.getEntityRegistry();
    expect(registry.getAllEntityTypes()).toEqual(["guide"]);
    expect(registry.getEntityTypeConfig("guide")).toMatchObject({
      projectionSourceRole: "primary",
    });
    expect(registry.getAdapter("guide").purpose).toBe(
      "A moving-in guide: how one kind of user brings their material and habits into a brain.",
    );
  });

  it("tells the agent to answer guide questions from their guide", async () => {
    const { capabilities } = await installed();
    expect(capabilities.map(({ instructions }) => instructions)).toEqual([
      [
        'Guides (entityType "guide") walk one kind of user through moving into a brain: a writer, researcher, consultant, team, or someone running their own brain.',
        "A question from someone who describes themselves, their material or how they work, and asks where to start, how to bring their material in, how to run a brain of their own, such as on their own server, or what a brain would do for them, is a guide question, even when it names no guide. A guide question is answered from its guide alone, without searching the docs: the guide links the docs for the details.",
        'For a guide question, first run system_list with entityType "guide", before asking the network or answering from general knowledge: each guide\'s metadata says who it is for (persona, for) and what material it moves in. Read the guide that fits the person with system_get, and answer from its stages.',
        'Name the guide you answer from by its title, such as "Moving in as a writer", so the reply links to it.',
      ].join("\n"),
    ]);
  });

  it("registers its public templates and data sources under guides", async () => {
    const { shell } = await installed();
    const templates = shell.getTemplates();
    expect([...templates.keys()].sort()).toEqual([
      "guides:guide-band",
      "guides:guide-detail",
      "guides:guide-list",
      "guides:guide-sections",
    ]);
    expect(
      [...templates.entries()]
        .map(([name, template]) => [
          name,
          template.dataSourceId,
          template.requiredPermission,
          template.runtimeScripts ?? [],
          Object.keys(template.staticAssets ?? {}),
        ])
        .sort(([a], [b]) => String(a).localeCompare(String(b))),
    ).toEqual([
      ["guides:guide-band", "guides:entities", "public", [], []],
      [
        "guides:guide-detail",
        "guides:entities",
        "public",
        [{ src: "/scripts/guide-page.js", defer: true }],
        ["/scripts/guide-page.js"],
      ],
      ["guides:guide-list", "guides:entities", "public", [], []],
      ["guides:guide-sections", "guides:sections", "public", [], []],
    ]);
    expect(
      shell
        .getDataSourceRegistry()
        .list()
        .map(({ id }) => id)
        .sort(),
    ).toEqual(["guides:entities", "guides:sections"]);
  });
});
