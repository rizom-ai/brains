import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  PluginConfigValidationError,
  defineDataSource,
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type AnyEntityDefinition,
  type EntityPackageConfiguration,
  type Plugin,
} from "../src";

/**
 * An entity package's own settings: a config schema the brain gives values
 * for, read by what `configure` binds once per instantiation — data
 * sources, and an entity's create route and evals.
 */

const bookmark = defineEntity({
  type: "bookmark",
  purpose: "A saved page.",
  metadata: z.object({ title: z.string() }),
});
const digest = defineEntity({
  type: "digest",
  purpose: "A digest derived from a saved page.",
  metadata: z.object({ title: z.string() }),
});

const libraryConfig = z.object({
  shelfTitle: z.string().default("Reading list"),
  digestRefusal: z.string().default("Digests are derived."),
});

function library(
  configure: (context: {
    readonly config: z.output<typeof libraryConfig>;
  }) => EntityPackageConfiguration<
    readonly [typeof bookmark, typeof digest]
  > = ({ config }) => ({
    dataSources: [
      defineDataSource({
        id: "shelf",
        name: "Shelf",
        description: "The shelf title",
        fetch: async () => ({ title: config.shelfTitle }),
      }),
    ],
    entities: [
      {
        entity: digest,
        create: {
          fromContent: {
            resolve: async () => ({ refuse: config.digestRefusal }),
          },
        },
        evals: { shelf: async () => config.shelfTitle },
      },
    ],
  }),
): ReturnType<typeof defineEntityPackage> {
  return defineEntityPackage({
    id: "library",
    config: libraryConfig,
    entities: [bookmark, digest],
    configure,
  });
}

const metadata = { name: "@fixture/library", version: "0.1.0" };

async function install(
  definition: ReturnType<typeof defineEntityPackage>,
  config: unknown,
): Promise<{
  harness: ReturnType<typeof createPluginHarness>;
  evals: Map<string, (input: unknown) => Promise<unknown>>;
}> {
  const plugins: Plugin[] = instantiatePluginPackageDefinition(
    definition,
    config,
    metadata,
  );
  const harness = createPluginHarness({ logger: createSilentLogger() });
  const evals = new Map<string, (input: unknown) => Promise<unknown>>();
  harness.getMockShell().registerEvalHandler = (
    _pluginId,
    id,
    handler,
  ): void => {
    evals.set(id, handler);
  };
  for (const plugin of plugins) await harness.installPlugin(plugin);
  return { harness, evals };
}

async function shelfTitle(
  harness: ReturnType<typeof createPluginHarness>,
): Promise<unknown> {
  const source = harness.getDataSources().get("@fixture/library:shelf");
  if (!source?.fetch) throw new Error("No shelf data source");
  return source.fetch({}, z.object({ title: z.string() }), {
    entityService: harness.getEntityService(),
  });
}

async function createDigest(
  harness: ReturnType<typeof createPluginHarness>,
): Promise<unknown> {
  const interceptor = harness
    .getEntityRegistry()
    .getCreateInterceptor("digest");
  if (!interceptor) throw new Error("No digest create route");
  return interceptor(
    { entityType: "digest", content: "A digest", title: "Digest" },
    {
      interfaceType: "mcp",
      actor: { kind: "service", serviceId: "test" },
      userPermissionLevel: "admin",
    },
  );
}

describe("an entity package's config", () => {
  it("reaches what configure binds, with its defaults", async () => {
    const { harness, evals } = await install(library(), {});

    expect(await shelfTitle(harness)).toEqual({ title: "Reading list" });
    expect(await createDigest(harness)).toMatchObject({
      kind: "handled",
      result: { success: false, error: "Digests are derived." },
    });
    expect(await evals.get("shelf")?.({})).toBe("Reading list");
    await harness.reset();
  });

  it("reaches what configure binds, with the values the brain gives", async () => {
    const { harness, evals } = await install(library(), {
      shelfTitle: "Saved",
      digestRefusal: "No manual digests.",
    });

    expect(await shelfTitle(harness)).toEqual({ title: "Saved" });
    expect(await createDigest(harness)).toMatchObject({
      result: { success: false, error: "No manual digests." },
    });
    expect(await evals.get("shelf")?.({})).toBe("Saved");
    await harness.reset();
  });

  it("refuses values the schema refuses", () => {
    expect(() =>
      instantiatePluginPackageDefinition(
        library(),
        { shelfTitle: 1 },
        metadata,
      ),
    ).toThrow(PluginConfigValidationError);
  });

  it("runs configure once per instantiation", () => {
    let runs = 0;
    const counted = library(() => {
      runs += 1;
      return {};
    });
    instantiatePluginPackageDefinition(counted, {}, metadata);
    instantiatePluginPackageDefinition(counted, {}, metadata);
    expect(runs).toBe(2);
  });

  it("leaves a package without config or configure as it was", () => {
    const plain = defineEntityPackage({ id: "plain", entities: [bookmark] });
    expect(
      instantiatePluginPackageDefinition(plain, {}, metadata).map(
        ({ id }) => id,
      ),
    ).toEqual(["@fixture/library:bookmark"]);
  });
});

describe("what configure binds is held to the package's checks", () => {
  function refusal(configure: Parameters<typeof library>[0]): () => Plugin[] {
    return () =>
      instantiatePluginPackageDefinition(library(configure), {}, metadata);
  }
  const elsewhere: AnyEntityDefinition = defineEntity({
    type: "elsewhere",
    purpose: "An entity of another package.",
    metadata: z.object({}),
  });

  it("refuses a data source id the package already uses", () => {
    const shelf = defineDataSource({
      id: "shelf",
      name: "Shelf",
      description: "Twice",
      fetch: async () => ({}),
    });
    expect(refusal(() => ({ dataSources: [shelf, shelf] }))).toThrow(
      /duplicate data source ids/,
    );
  });

  it("refuses an entity outside the package", () => {
    // Typed loosely, as an untyped caller is, so the types let it through.
    const members: readonly AnyEntityDefinition[] = [bookmark];
    expect(() =>
      instantiatePluginPackageDefinition(
        defineEntityPackage({
          id: "loose",
          entities: members,
          configure: () => ({
            entities: [
              {
                entity: elsewhere,
                evals: { x: async (): Promise<number> => 1 },
              },
            ],
          }),
        }),
        {},
        metadata,
      ),
    ).toThrow(/outside its package/);
  });

  it("refuses the same entity twice", () => {
    expect(
      refusal(() => ({
        entities: [
          { entity: digest, evals: { a: async (): Promise<number> => 1 } },
          { entity: digest, evals: { b: async (): Promise<number> => 2 } },
        ],
      })),
    ).toThrow(/twice/);
  });

  it("refuses a slot the entity declares already", () => {
    const declared = defineEntity({
      type: "declared",
      purpose: "Declares its evals.",
      metadata: z.object({}),
      evals: { own: async (): Promise<number> => 1 },
    });
    expect(() =>
      instantiatePluginPackageDefinition(
        defineEntityPackage({
          id: "declared",
          entities: [declared],
          configure: () => ({
            entities: [
              {
                entity: declared,
                evals: { other: async (): Promise<number> => 2 },
              },
            ],
          }),
        }),
        {},
        metadata,
      ),
    ).toThrow(/declares it already/);
  });
});
