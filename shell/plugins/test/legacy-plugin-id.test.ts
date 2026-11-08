import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  createTemplate,
  defineDataSource,
  defineEntity,
  defineEntityJob,
  defineEntityPackage,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * A first-party package converted to a definition keeps the plugin id its
 * class had, so the names derived from it — templates, data sources, jobs,
 * the plugin's channels — stay what sites, brains and queued jobs use.
 * Only the composer names it; package source never does.
 */

const doc = defineEntity({
  type: "doc",
  purpose: "A documentation page.",
  metadata: z.object({ title: z.string() }),
  templates: {
    "doc-list": createTemplate({
      name: "doc-list",
      description: "Every doc",
      schema: z.object({ title: z.string() }),
      dataSourceId: "entities",
      requiredPermission: "public",
    }),
  },
  jobs: {
    reindex: defineEntityJob({
      input: z.object({}),
      handle: async () => ({ done: true }),
    }),
  },
});

const docs = defineEntityPackage({
  id: "docs",
  entities: [doc],
  dataSources: [
    defineDataSource({
      id: "entities",
      name: "Docs",
      description: "Every doc",
      fetch: async () => ({ title: "Docs" }),
    }),
  ],
});

const metadata = { name: "@brains/doc", version: "0.1.0" };

async function install(options?: { pluginId: string }): Promise<{
  pluginIds: string[];
  harness: ReturnType<typeof createPluginHarness>;
}> {
  const plugins = instantiatePluginPackageDefinition(
    docs,
    {},
    metadata,
    options,
  );
  const harness = createPluginHarness({ logger: createSilentLogger() });
  for (const plugin of plugins) await harness.installPlugin(plugin);
  return { pluginIds: plugins.map(({ id }) => id), harness };
}

describe("an entity package instantiated under a legacy plugin id", () => {
  it("registers its plugin, templates, data sources and jobs under that id", async () => {
    const { pluginIds, harness } = await install({ pluginId: "docs" });

    expect(pluginIds).toEqual(["docs"]);
    expect([...harness.getTemplates().keys()]).toEqual(["docs:doc-list"]);
    expect(harness.getTemplates().get("docs:doc-list")?.dataSourceId).toBe(
      "docs:entities",
    );
    expect([...harness.getDataSources().keys()]).toEqual(["docs:entities"]);
    expect(
      harness.getMockShell().getJobQueueService().getRegisteredTypes(),
    ).toEqual(["docs:reindex"]);
    await harness.reset();
  });

  it("keeps the package as the owner and its plugin under the package name", async () => {
    const plugins = instantiatePluginPackageDefinition(docs, {}, metadata, {
      pluginId: "docs",
    });
    expect(plugins.map(({ packageName }) => packageName)).toEqual([
      "@brains/doc",
    ]);
  });

  it("scopes every name by the package without one", async () => {
    const { pluginIds, harness } = await install();

    expect(pluginIds).toEqual(["@brains/doc:doc"]);
    expect([...harness.getTemplates().keys()]).toEqual([
      "@brains/doc:doc:doc-list",
    ]);
    expect([...harness.getDataSources().keys()]).toEqual([
      "@brains/doc:entities",
    ]);
    await harness.reset();
  });

  it("is refused for a package that installs more than one plugin", () => {
    const pair = defineEntityPackage({
      id: "pair",
      entities: [
        doc,
        defineEntity({
          type: "page",
          purpose: "A page.",
          metadata: z.object({}),
        }),
      ],
    });
    expect(() =>
      instantiatePluginPackageDefinition(pair, {}, metadata, {
        pluginId: "pair",
      }),
    ).toThrow(/one plugin/);
  });

  it("is refused for a family other than an entity package", () => {
    const service = defineServicePlugin({
      id: "service",
      config: z.object({}),
    });
    expect(() =>
      instantiatePluginPackageDefinition(service, {}, metadata, {
        pluginId: "service",
      }),
    ).toThrow(/entity package/);
  });

  it("is refused when it is not a plugin identifier", () => {
    expect(() =>
      instantiatePluginPackageDefinition(docs, {}, metadata, {
        pluginId: "Docs!",
      }),
    ).toThrow();
  });
});
