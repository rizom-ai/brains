import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { publishRegisterContract } from "@brains/contracts";
import { createMockProgressReporter } from "@brains/test-utils";
import { createPluginHarness } from "../src/test/harness";
import { queuedByPackage } from "../src/test/package-job-data";
import {
  PluginConfigValidationError,
  SYSTEM_CHANNELS,
  defineDataSource,
  defineEntity,
  defineEntityJob,
  defineEntityPackage,
  defineProjectionRule,
  instantiatePluginPackageDefinition,
  type AnyEntityDefinition,
  type EntityGenerationDeclaration,
  type EntityPackageConfiguration,
  type Plugin,
} from "../src";

/**
 * An entity package's own settings: a config schema the brain gives values
 * for, read by what `configure` binds once per instantiation — data
 * sources, and an entity's create route and evals.
 */

const bookmarkMetadata = z.object({ title: z.string() });
const bookmark = defineEntity({
  type: "bookmark",
  purpose: "A saved page.",
  metadata: bookmarkMetadata,
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

/** A configured job or generation, run as the package queued it. */
async function runJob(
  harness: ReturnType<typeof createPluginHarness>,
  type: string,
  input: unknown,
): Promise<unknown> {
  const handler = harness.getMockShell().getJobQueueService().getHandler(type);
  if (!handler) throw new Error(`No job handler registered for ${type}`);
  return handler.process(
    handler.validateAndParse(
      queuedByPackage("@fixture/library:bookmark", input),
    ),
    "job-under-test",
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

const promptInput = z.object({ prompt: z.string() });

/** A generation that names the token it was configured with. */
function promptGeneration(
  token: string,
): EntityGenerationDeclaration<typeof promptInput, typeof bookmarkMetadata> {
  return {
    input: promptInput,
    generate: async ({ input }) => ({
      success: true,
      content: `${input.prompt} (${token})`,
      metadata: { title: "Generated" },
    }),
  };
}

describe("the slots configure binds from a package's config", () => {
  // A package with an API token: its publish provider, its job, its
  // generation and its projection rules read the token from the config.
  const tokenConfig = z.object({ token: z.string().default("none") });
  const published: string[] = [];
  const tokened = defineEntityPackage({
    id: "library",
    config: tokenConfig,
    entities: [bookmark],
    configure: ({ config }) => ({
      entities: [
        {
          entity: bookmark,
          publish: {
            provider: {
              name: `reader-${config.token}`,
              publish: async (content: string): Promise<{ id: string }> => {
                published.push(`${config.token}:${content}`);
                return { id: "remote-1" };
              },
            },
          },
          jobs: {
            check: defineEntityJob({
              input: z.object({ url: z.string() }),
              handle: async ({ input }) => ({
                checked: `${input.url} with ${config.token}`,
              }),
            }),
          },
          generation: promptGeneration(config.token),
          // A rule that only runs once a token is configured.
          projectionRules:
            config.token === "none"
              ? []
              : [
                  defineProjectionRule({
                    id: "bookmark-check",
                    version: "1",
                    sources: [{ kind: "entity", types: ["bookmark"] }],
                    targetType: "bookmark",
                    inputSchema: z.object({}),
                    selectInput: async () => ({}),
                    derive: async () => [],
                  }),
                ],
        },
      ],
    }),
  });

  it("registers the bound publish provider, job and generation with the config's values", async () => {
    const plugins = instantiatePluginPackageDefinition(
      tokened,
      { token: "secret" },
      metadata,
    );
    const harness = createPluginHarness({ logger: createSilentLogger() });
    const rules: unknown[] = [];
    for (const plugin of plugins) {
      rules.push(
        ...((await harness.installPlugin(plugin)).projectionRules ?? []),
      );
    }
    try {
      expect(rules).toEqual([
        expect.objectContaining({ id: "bookmark-check" }),
      ]);
      const registrations: unknown[] = [];
      harness
        .getMockShell()
        .getMessageBus()
        .subscribe(publishRegisterContract.name, async (message) => {
          registrations.push(message.payload);
          return { success: true };
        });
      await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {});
      expect(registrations).toEqual([
        expect.objectContaining({
          entityType: "bookmark",
          provider: expect.objectContaining({ name: "reader-secret" }),
        }),
      ]);
      expect(
        await runJob(harness, "@fixture/library:bookmark:check", {
          url: "https://example.com",
        }),
      ).toEqual({ checked: "https://example.com with secret" });
      expect(
        await runJob(harness, "bookmark:generation", { prompt: "About tides" }),
      ).toMatchObject({ success: true });
      const [written] = await harness
        .getEntityService()
        .listEntities({ entityType: "bookmark" });
      expect(written?.content).toBe("About tides (secret)");
    } finally {
      await harness.reset();
    }
  });

  it("leaves the slots out when configure binds none", async () => {
    const bare = defineEntityPackage({
      id: "library",
      config: tokenConfig,
      entities: [bookmark],
      configure: () => ({}),
    });
    const plugins = instantiatePluginPackageDefinition(bare, {}, metadata);
    const harness = createPluginHarness({ logger: createSilentLogger() });
    for (const plugin of plugins) await harness.installPlugin(plugin);
    try {
      expect(
        harness
          .getMockShell()
          .getJobQueueService()
          .getHandler("bookmark:generation"),
      ).toBeUndefined();
    } finally {
      await harness.reset();
    }
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

  it("refuses a slot configure cannot bind", () => {
    // Held in a variable, as a caller building bindings does, so the extra
    // key is not refused by the types.
    const binding = { entity: digest, templates: {} };
    expect(refusal(() => ({ entities: [binding] }))).toThrow(
      /cannot configure the templates of "digest"/,
    );
  });

  it("refuses a publish provider, job, generation or rules the entity declares already", () => {
    const declared = defineEntity({
      type: "declared",
      purpose: "Declares its jobs.",
      metadata: z.object({}),
      jobs: {
        own: defineEntityJob({
          input: z.object({}),
          handle: async (): Promise<null> => null,
        }),
      },
    });
    expect(() =>
      instantiatePluginPackageDefinition(
        defineEntityPackage({
          id: "declared",
          entities: [declared],
          configure: () => ({
            entities: [{ entity: declared, jobs: {} }],
          }),
        }),
        {},
        metadata,
      ),
    ).toThrow(/configures the jobs of "declared", which declares it already/);
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
