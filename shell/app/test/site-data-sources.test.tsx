/** @jsxImportSource react */
import { describe, expect, it } from "bun:test";
import {
  defineDataSource,
  defineEntity,
  defineEntityPackage,
  defineServicePlugin,
  defineSharedState,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { defineSection, defineSite, sectionGroup, z } from "@rizom/site";
import { instantiateSitePlugins } from "../src/resolver/site";

const visits = defineSharedState(
  "@fixture/counter:visits",
  z.object({ count: z.number() }),
);

const bookmark = defineEntity({
  type: "bookmark",
  purpose: "A saved page.",
  metadata: z.object({ title: z.string() }),
});

/** Another package: a source of bookmark titles. */
const library = defineEntityPackage({
  id: "library",
  entities: [bookmark],
  dataSources: [
    defineDataSource({
      id: "titles",
      name: "Titles",
      description: "Bookmark titles",
      fetch: async (_query, entities) => ({
        titles: (await entities.list(bookmark)).map(
          (entry) => entry.metadata.title,
        ),
      }),
    }),
  ],
});

/** Another package: owns the visit count and records one at setup. */
const counter = defineServicePlugin({
  id: "counter",
  config: z.object({}),
  setup: async ({ runtimeState }) => {
    await runtimeState(visits).set("total", { count: 3 });
    return {};
  },
});

const shelfSchema = z.object({
  heading: z.string(),
  titles: z.array(z.string()),
});

const site = defineSite({
  layouts: { default: ({ sections }) => <main>{sections}</main> },
  routes: [
    {
      id: "home",
      path: "/",
      title: "Home",
      sections: [{ id: "shelf", template: "library:shelf" }],
    },
  ],
  sections: [
    sectionGroup("library", {
      shelf: defineSection(shelfSchema, ({ heading }) => <h2>{heading}</h2>, {
        title: "Shelf",
        description: "The shelf",
        dataSource: "shelf",
      }),
    }),
  ],
  dataSources: [
    defineDataSource({
      id: "shelf",
      name: "Shelf",
      description: "Titles from the library and the visit count",
      fetch: async (_query, _entities, context) => {
        const library = await context.dataSources.fetch(
          "@fixture/library:titles",
          {},
          z.object({ titles: z.array(z.string()) }),
        );
        const counted = await context.sharedState(visits).get("total");
        return {
          heading: `Visited ${counted?.count ?? 0} times`,
          titles: library?.titles ?? [],
        };
      },
    }),
  ],
  entityDisplay: {},
});

/** The message a promise is refused with. */
async function refusal(promise: Promise<unknown> | undefined): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected a refusal");
}

describe("a site's declared data sources", () => {
  it("are registered under the site package and drawn into its sections", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    try {
      for (const [definition, name] of [
        [library, "@fixture/library"],
        [counter, "@fixture/counter"],
      ] as const) {
        for (const plugin of instantiatePluginPackageDefinition(
          definition,
          {},
          { name, version: "0.1.0" },
        )) {
          await harness.installPlugin(plugin);
        }
      }
      await harness.getEntityService().createEntity({
        entity: {
          id: "first",
          entityType: "bookmark",
          content: "First",
          metadata: { title: "First" },
        },
      });

      const plugins = instantiateSitePlugins(
        site,
        { site: { package: "@fixture/site" } },
        new Set(["site-builder"]),
      );
      for (const plugin of plugins) await harness.installPlugin(plugin);

      const source = harness.getDataSources().get("@fixture/site:shelf");
      expect(source?.publicId).toBe("@fixture/site:shelf");
      expect(harness.getTemplates().get("library:shelf")?.dataSourceId).toBe(
        "@fixture/site:shelf",
      );
      expect(
        await source?.fetch?.({}, shelfSchema, {
          entityService: harness.getEntityService(),
        }),
      ).toEqual({ heading: "Visited 3 times", titles: ["First"] });
    } finally {
      await harness.reset();
    }
  });

  it("refuse a source that is not a fetching declaration", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    try {
      // A source that skipped defineSite's checks and has nothing to fetch.
      const [declared] = site.dataSources ?? [];
      if (!declared) throw new Error("No data source");
      const forgedSource = { ...declared };
      Reflect.deleteProperty(forgedSource, "fetch");
      const forged = { ...site, dataSources: [forgedSource] };
      const plugins = instantiateSitePlugins(
        forged,
        { site: { package: "@fixture/site" } },
        new Set(["site-builder"]),
      );
      for (const plugin of plugins.slice(0, -1)) {
        await harness.installPlugin(plugin);
      }
      const last = plugins.at(-1);
      if (!last) throw new Error("No site plugin");
      expect(await refusal(harness.installPlugin(last))).toContain(
        'Site data source "shelf" is not a fetching source declared with defineDataSource',
      );
    } finally {
      await harness.reset();
    }
  });
});
