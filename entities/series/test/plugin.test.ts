import { describe, it, expect } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { seriesPlugin, type SeriesEntityPlugin } from "./series-plugin";

/**
 * What the series register, as the series plugin class registered it: the
 * same plugin id, type, templates, data source, projection rule and AT
 * Protocol projection. Its `series:generation` job is retired.
 */
async function installed(): Promise<{
  harness: ReturnType<typeof createPluginHarness<SeriesEntityPlugin>>;
  capabilities: Awaited<
    ReturnType<
      ReturnType<
        typeof createPluginHarness<SeriesEntityPlugin>
      >["installPlugin"]
    >
  >;
  plugin: SeriesEntityPlugin;
}> {
  const harness = createPluginHarness<SeriesEntityPlugin>({
    logger: createSilentLogger("series-plugin-test"),
  });
  const plugin = seriesPlugin();
  const capabilities = await harness.installPlugin(plugin);
  return { harness, capabilities, plugin };
}

describe("the series package", () => {
  it("registers the series entity plugin under its class's id", async () => {
    const { harness, plugin } = await installed();

    expect(plugin.type).toBe("entity");
    expect(plugin.id).toBe("series");
    expect(plugin.packageName).toBe("@brains/series");
    expect(harness.getEntityService().getEntityTypes()).toContain("series");
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("series"),
    ).toMatchObject({ weight: 0.5, projectionSourceRole: "supporting" });
    expect(plugin.adapter.supportsCoverImage).toBe(true);
    expect(plugin.adapter.purpose).toBe(
      "A series grouping related posts or content under one theme.",
    );
  });

  it("returns zero tools", async () => {
    const { capabilities } = await installed();

    expect(capabilities.tools).toHaveLength(0);
  });

  it("registers one scheduler-owned projection rule", async () => {
    const { capabilities } = await installed();

    expect("projections" in capabilities).toBe(false);
    expect(capabilities.projectionRules).toHaveLength(1);
    expect(capabilities.projectionRules?.[0]).toMatchObject({
      id: "series-projection",
      version: "1",
      sources: [{ kind: "entity", types: ["*"], excludeTypes: ["series"] }],
      targetType: "series",
    });
  });

  it("registers its templates on its data source and the AI content source", async () => {
    const { harness } = await installed();

    expect(
      [...harness.getTemplates()]
        .filter(([name]) => name.startsWith("series:"))
        .map(([name, template]) => [name, template.dataSourceId])
        .sort(),
    ).toEqual([
      ["series:description", "shell:ai-content"],
      ["series:series-detail", "series:entities"],
      ["series:series-list", "series:entities"],
    ]);
  });

  it("registers its data source", async () => {
    const { harness } = await installed();

    expect([...harness.getDataSources().keys()]).toContain("series:entities");
  });

  it("registers no job types, its generation job retired", async () => {
    const { harness } = await installed();

    expect(
      harness.getMockShell().getJobQueueService().getRegisteredTypes(),
    ).toEqual([]);
  });
});
