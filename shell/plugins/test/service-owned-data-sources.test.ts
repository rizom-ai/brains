import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineDataSource,
  defineEntity,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  withOwnedDataSources,
} from "../src";

/**
 * A first-party service converted from an entity plugin class keeps the
 * data sources the class registered on its type, such as site-info's
 * `site-info:entities`. The public service contract has no data sources;
 * `withOwnedDataSources` installs them on the service's owned type, read as
 * an entity package's are.
 */

const siteCard = defineEntity({
  type: "site-card",
  purpose: "The site's own card.",
  metadata: z.object({ title: z.string().optional() }),
});

const card = defineDataSource({
  id: "entities",
  name: "Site card",
  description: "The site's card",
  fetch: async (_query, entities) => {
    const record = await entities.get(siteCard, "site-card");
    return { title: record?.metadata.title ?? "Untitled" };
  },
});

const service = defineServicePlugin({
  id: "site-metadata",
  config: z.object({}),
  entities: [siteCard],
});

const metadata = { name: "@brains/site-card", version: "0.1.0" };

async function install(
  pluginId?: string,
): Promise<ReturnType<typeof createPluginHarness>> {
  const plugins = instantiatePluginPackageDefinition(
    withOwnedDataSources(service, [card]),
    {},
    metadata,
    pluginId === undefined ? {} : { pluginId },
  );
  const harness = createPluginHarness({ logger: createSilentLogger() });
  for (const plugin of plugins) await harness.installPlugin(plugin);
  return harness;
}

async function fetchTitle(
  harness: ReturnType<typeof createPluginHarness>,
  id: string,
): Promise<unknown> {
  const source = harness.getDataSources().get(id);
  if (!source?.fetch) throw new Error(`No data source ${id}`);
  return source.fetch({}, z.object({ title: z.string() }), {
    entityService: harness.getEntityService(),
  });
}

describe("a first-party service's data sources on the type it owns", () => {
  it("registers under its type's legacy id and reads the type at public scope", async () => {
    const harness = await install("site-metadata");
    harness.addEntities([
      {
        id: "site-card",
        entityType: "site-card",
        content: "---\ntitle: Kept\n---\n",
        metadata: { title: "Kept" },
        visibility: "public",
      },
    ]);

    expect([...harness.getDataSources().keys()]).toEqual([
      "site-card:entities",
    ]);
    expect(await fetchTitle(harness, "site-card:entities")).toEqual({
      title: "Kept",
    });
    await harness.reset();
  });

  it("does not read a record the build may not see", async () => {
    const harness = await install("site-metadata");
    harness.addEntities([
      {
        id: "site-card",
        entityType: "site-card",
        content: "---\ntitle: Private\n---\n",
        metadata: { title: "Private" },
        visibility: "restricted",
      },
    ]);

    expect(await fetchTitle(harness, "site-card:entities")).toEqual({
      title: "Untitled",
    });
    await harness.reset();
  });

  it("is scoped by the package without a legacy id", async () => {
    const harness = await install();
    expect([...harness.getDataSources().keys()]).toEqual([
      "@brains/site-card:entities",
    ]);
    await harness.reset();
  });

  it("keeps the service's definition otherwise", () => {
    const withSources = withOwnedDataSources(service, [card]);
    expect(withSources).toMatchObject({
      kind: "rizom-plugin-package",
      family: "service",
      id: "site-metadata",
    });
    expect(withSources.config).toBe(service.config);
  });

  it("is refused for a source reading a type the service does not own", () => {
    const stray = defineDataSource({
      id: "stray",
      name: "Stray",
      description: "Reads another type",
      defaultSort: [],
      entity: defineEntity({
        type: "elsewhere",
        purpose: "Not the service's.",
        metadata: z.object({}),
      }),
      transform: (entity) => entity,
      list: (items) => ({ count: items.length }),
    });
    expect(() => withOwnedDataSources(service, [stray])).toThrow(
      /reads an entity outside its package/,
    );
  });

  it("is refused for one id twice", () => {
    expect(() => withOwnedDataSources(service, [card, card])).toThrow(
      /duplicate data source ids/,
    );
  });

  it("is refused for a definition no service helper created", () => {
    expect(() =>
      withOwnedDataSources({ ...service, family: "service" as const }, [card]),
    ).toThrow(/defineServicePlugin/);
  });
});
