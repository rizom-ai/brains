/** @jsxImportSource react */
import { describe, expect, it } from "bun:test";
import {
  createTemplate,
  defineBusContract,
  defineDataSource,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  siteDataSourceRuntime,
  withSiteRuntime,
  withSiteRuntimeDefaults,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { defineSite, z } from "@rizom/site";
import { instantiateSitePlugins } from "../src/resolver/site";

const whoAsked = defineBusContract({
  channel: "@fixture/echo:who",
  request: z.object({}),
  response: z.object({ sender: z.string() }),
  delivery: "request",
});

/** Another package: answers who asked. */
const echo = defineServicePlugin(
  { id: "echo", config: z.object({}) },
  {
    subscriptions: ({ answer }) => [
      answer(whoAsked, ({ sender }) => ({ sender })),
    ],
  },
);

const homeSchema = z.object({
  greeting: z.string(),
  postsLabel: z.string(),
  sameEntityService: z.boolean(),
  siteUrl: z.string().nullable(),
  routes: z.number(),
  asked: z.string(),
  logs: z.boolean(),
});

const structural = defineSite({
  layouts: { default: ({ sections }) => <main>{sections}</main> },
  routes: [
    {
      id: "home",
      path: "/",
      title: "Home",
      sections: [{ id: "home", template: "test-site:home" }],
    },
  ],
  entityDisplay: { post: { label: "Essay" } },
});

/** A first-party site whose templates and sources read its config. */
const site = withSiteRuntime(structural, {
  id: "test-site",
  config: z.object({
    entityDisplay: z.record(z.string(), z.object({ label: z.string() })),
    greeting: z.string().default("Hi"),
  }),
  templates: ({ config }) => ({
    home: createTemplate<z.infer<typeof homeSchema>>({
      name: "home",
      description: `Greets with ${config.greeting}`,
      schema: homeSchema,
      dataSourceId: "test-site:home",
      requiredPermission: "public",
      layout: { component: ({ greeting }) => <p>{greeting}</p> },
    }),
  }),
  dataSources: ({ config }) => [
    defineDataSource({
      id: "home",
      name: "Home",
      description: "The greeting and what the runtime gives a site",
      fetch: async (_query, _entities, context) => {
        const runtime = siteDataSourceRuntime(context);
        const asked = await runtime.messaging.request(whoAsked, {});
        return {
          greeting: config.greeting,
          postsLabel: config.entityDisplay["post"]?.label ?? "",
          sameEntityService: runtime.entityService === buildEntities,
          siteUrl: runtime.siteUrl ?? null,
          routes: runtime.webRoutes().length,
          asked: asked.status === "answered" ? asked.data.sender : "",
          logs: typeof runtime.logger.info === "function",
        };
      },
    }),
  ],
});

let buildEntities: unknown;

describe("a first-party site's runtime", () => {
  it("validates and travels as the structural site it is", () => {
    expect(Object.keys(site)).toEqual(Object.keys(structural));
  });

  it("registers its templates and sources under its id, configured as the plugin was", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    try {
      for (const plugin of instantiatePluginPackageDefinition(
        echo,
        {},
        { name: "@fixture/echo", version: "0.1.0" },
      )) {
        await harness.installPlugin(plugin);
      }
      // brain.yaml's site settings, beside the package it names.
      const siteSettings = { package: "@fixture/site", greeting: "Hello" };
      const plugins = instantiateSitePlugins(
        site,
        { site: siteSettings },
        new Set(["site-builder"]),
      );
      for (const plugin of plugins) await harness.installPlugin(plugin);

      expect(harness.getTemplates().get("test-site:home")?.description).toBe(
        "Greets with Hello",
      );
      const source = harness.getDataSources().get("test-site:home");
      expect(source?.publicId).toBe("@fixture/site:home");

      buildEntities = harness.getEntityService();
      expect(
        await source?.fetch?.({}, homeSchema, {
          entityService: harness.getEntityService(),
        }),
      ).toEqual({
        greeting: "Hello",
        postsLabel: "Essay",
        sameEntityService: true,
        siteUrl: null,
        routes: 0,
        // Asked under the site's id, as its plugin asked.
        asked: "test-site",
        logs: true,
      });
    } finally {
      await harness.reset();
    }
  });

  it("takes a conventional site's plugin config under brain.yaml's settings", async () => {
    const descriptions = async (
      settings: Record<string, string>,
    ): Promise<string | undefined> => {
      const harness = createPluginHarness({ logger: createSilentLogger() });
      try {
        const configured = withSiteRuntimeDefaults(site, { greeting: "Hey" });
        for (const plugin of instantiateSitePlugins(
          configured,
          { site: { package: "@fixture/site", ...settings } },
          new Set(["site-builder"]),
        )) {
          await harness.installPlugin(plugin);
        }
        return harness.getTemplates().get("test-site:home")?.description;
      } finally {
        await harness.reset();
      }
    };
    expect(await descriptions({})).toBe("Greets with Hey");
    expect(await descriptions({ greeting: "Hello" })).toBe("Greets with Hello");
  });

  it("is refused outside a site's data source", () => {
    expect(() => siteDataSourceRuntime({})).toThrow("carries no site runtime");
  });
});
