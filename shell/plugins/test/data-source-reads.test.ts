import { describe, expect, it } from "bun:test";
import type { DataSource } from "@brains/entity-service";
import { scopeEntityReads } from "@brains/entity-service";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineDataSource,
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type AnyDataSourceDeclaration,
  type PluginPackageInstantiationOptions,
} from "../src";

type Harness = ReturnType<typeof createPluginHarness>;

const bookmark = defineEntity({
  type: "bookmark",
  purpose: "A saved page.",
  metadata: z.object({ title: z.string(), status: z.string() }),
});

const note = defineEntity({
  type: "page-note",
  purpose: "A note on a page.",
  metadata: z.object({ title: z.string() }),
});

const titles = z.object({ titles: z.array(z.string()) });

/** The library's own source: every bookmark its build may see. */
const shelf = defineDataSource({
  id: "shelf",
  name: "Shelf",
  description: "Bookmark titles",
  fetch: async (_query, entities) => ({
    titles: (
      await entities.list(bookmark, {
        sort: [{ field: "title", direction: "asc" }],
      })
    ).map((entry) => entry.metadata.title),
  }),
});

async function install(
  harness: Harness,
  name: string,
  id: string,
  entities: Parameters<typeof defineEntityPackage>[0]["entities"],
  dataSources: readonly AnyDataSourceDeclaration[],
  options?: PluginPackageInstantiationOptions,
): Promise<void> {
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id, entities, dataSources }),
    {},
    { name, version: "0.1.0" },
    options,
  )) {
    await harness.installPlugin(plugin);
  }
}

/** A reader that answers what another package's source answered. */
function relay(
  id: string,
  source: `${string}:${string}`,
): AnyDataSourceDeclaration {
  return defineDataSource({
    id,
    name: id,
    description: `Reads ${source}`,
    fetch: async (query, _entities, context) => ({
      read: await context.dataSources.fetch(source, query, titles),
    }),
  });
}

function registered(harness: Harness, id: string): DataSource {
  const dataSource = harness.getDataSources().get(id);
  if (!dataSource?.fetch) throw new Error(`Data source ${id} is missing`);
  return dataSource;
}

const relayed = z.object({ read: titles.nullable() });

async function seed(harness: Harness): Promise<void> {
  const entities = harness.getEntityService();
  for (const [id, status] of [
    ["kept", "published"],
    ["draft", "draft"],
  ] as const) {
    await entities.createEntity({
      entity: {
        id,
        entityType: "bookmark",
        content: id,
        metadata: { title: id, status },
      },
    });
  }
}

/** The message a promise is refused with. */
async function refusal(promise: Promise<unknown> | undefined): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected a refusal");
}

describe("a data source reading another package's source", () => {
  it("reads it by <package name>:<local id>, validated by the reader's schema", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    try {
      await install(
        harness,
        "@fixture/library",
        "library",
        [bookmark],
        [shelf],
      );
      await install(
        harness,
        "@fixture/site",
        "site",
        [note],
        [relay("front", "@fixture/library:shelf")],
      );
      await seed(harness);

      expect(
        await registered(harness, "@fixture/site:front").fetch?.({}, relayed, {
          entityService: harness.getEntityService(),
        }),
      ).toEqual({ read: { titles: ["draft", "kept"] } });
    } finally {
      await harness.reset();
    }
  });

  it("answers null when no installed package serves the source", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    try {
      await install(
        harness,
        "@fixture/site",
        "site",
        [note],
        [relay("front", "@fixture/library:shelf")],
      );
      expect(
        await registered(harness, "@fixture/site:front").fetch?.({}, relayed, {
          entityService: harness.getEntityService(),
        }),
      ).toEqual({ read: null });
    } finally {
      await harness.reset();
    }
  });

  it("reads a package installed under a legacy plugin id by its package name", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    try {
      await install(
        harness,
        "@brains/library",
        "library",
        [bookmark],
        [shelf],
        {
          pluginId: "library",
        },
      );
      await install(
        harness,
        "@fixture/site",
        "site",
        [note],
        [relay("front", "@brains/library:shelf")],
      );
      await seed(harness);
      // Registered under the legacy scope, read under the package's name.
      expect(harness.getDataSources().has("library:shelf")).toBe(true);
      expect(
        await registered(harness, "@fixture/site:front").fetch?.({}, relayed, {
          entityService: harness.getEntityService(),
        }),
      ).toEqual({ read: { titles: ["draft", "kept"] } });
    } finally {
      await harness.reset();
    }
  });

  it("reads at the calling build's context: a production build sees only published records", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    try {
      await install(
        harness,
        "@fixture/library",
        "library",
        [bookmark],
        [shelf],
      );
      await install(
        harness,
        "@fixture/site",
        "site",
        [note],
        [relay("front", "@fixture/library:shelf")],
      );
      await seed(harness);
      const front = registered(harness, "@fixture/site:front");
      const entities = harness.getEntityService();

      // The library's own source shows drafts in a preview.
      expect(
        await front.fetch?.({}, relayed, {
          entityService: scopeEntityReads(entities, { publishedOnly: false }),
          publishedOnly: false,
        }),
      ).toEqual({ read: { titles: ["draft", "kept"] } });
      expect(
        await front.fetch?.({}, relayed, {
          entityService: scopeEntityReads(entities, { publishedOnly: true }),
          publishedOnly: true,
        }),
      ).toEqual({ read: { titles: ["kept"] } });
    } finally {
      await harness.reset();
    }
  });

  it("refuses a read that would re-enter a source the chain is already reading", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    try {
      await install(
        harness,
        "@fixture/ping",
        "ping",
        [bookmark],
        [
          relay("ping", "@fixture/pong:pong"),
          relay("self", "@fixture/ping:self"),
        ],
      );
      await install(
        harness,
        "@fixture/pong",
        "pong",
        [note],
        [relay("pong", "@fixture/ping:ping")],
      );
      const context = { entityService: harness.getEntityService() };

      expect(
        await refusal(
          registered(harness, "@fixture/ping:ping").fetch?.(
            {},
            relayed,
            context,
          ),
        ),
      ).toContain(
        'Data source "@fixture/ping:ping" is already being read by this build\'s chain',
      );
      expect(
        await refusal(
          registered(harness, "@fixture/ping:self").fetch?.(
            {},
            relayed,
            context,
          ),
        ),
      ).toContain(
        'Data source "@fixture/ping:self" is already being read by this build\'s chain',
      );
    } finally {
      await harness.reset();
    }
  });
});
