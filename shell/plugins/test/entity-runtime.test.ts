import { afterEach, describe, expect, it, spyOn } from "bun:test";
import {
  EntityRegistry,
  EntityService,
  scopeEntityReads,
  type IEntityService,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  EntityPlugin,
  defineEntity,
  defineDataSource,
  defineEntityPackage,
  entityRuntime,
  instantiatePluginPackageDefinition,
  type DataSourceDefinition,
  type EntityCreateContext,
  type EntityCreateRouting,
  type EntityEvalDeclaration,
  type UserPermissionLevel,
} from "../src";

/**
 * The internal runtime a first-party definition reaches with
 * entityRuntime(context): bound to each create route's and eval's call, on
 * the brain's own entity store, and absent from a context the runtime did
 * not build.
 */

const DIMENSIONS = 1536;
// One axis per word: "tide" near the first, "bread" on the second.
function vector(text: string): Float32Array {
  const values = new Float32Array(DIMENSIONS);
  values[text.includes("tide") ? 0 : 1] = 1;
  return values;
}
function near(lean: number): Float32Array {
  const values = new Float32Array(DIMENSIONS);
  values[0] = 1 - lean;
  values[1] = lean;
  return values;
}

const note = z.object({ title: z.string() });
// The wish type as reads name it; each test declares its own slots on it.
const wishShape = defineEntity({
  type: "wish",
  purpose: "A wish.",
  metadata: note,
});
// Another package's type, with the lifecycle and grouping a cross-type read
// filters on.
const other = defineEntity({
  type: "other",
  purpose: "Another package's type.",
  metadata: note.extend({
    status: z.string().optional(),
    series: z.string().optional(),
  }),
});
let observed: unknown;
let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  observed = undefined;
  await close?.();
  close = undefined;
});

async function store(
  create: EntityCreateRouting,
  evals: EntityEvalDeclaration,
  dataSources: readonly DataSourceDefinition[] = [],
): Promise<{
  service: EntityService;
  shell: MockShell;
  evals: Map<string, (input: unknown) => Promise<unknown>>;
}> {
  const wish = defineEntity({
    type: "wish",
    purpose: "A wish.",
    metadata: note,
    create,
    evals,
  });
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  const plugins = [
    ...instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "wishes", entities: [wish], dataSources }),
      {},
      { name: "@fixture/wishes", version: "0.1.0" },
    ),
    ...instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "others", entities: [other] }),
      {},
      { name: "@fixture/others", version: "0.1.0" },
    ),
  ];
  for (const plugin of plugins) {
    if (plugin instanceof EntityPlugin) {
      registry.registerEntityType(
        plugin.entityType,
        plugin.schema,
        plugin.adapter,
      );
    }
  }
  const dbConfig = { url: `file:${directory.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingService: {
      identity: {
        model: "test:mock",
        dimensions: DIMENSIONS,
        promptRevision: 0,
      },
      embedQuery: async (text: string) => ({
        embedding: vector(text),
        usage: { tokens: 1 },
      }),
      embedDocuments: async (documents: { content: string }[]) => ({
        embeddings: documents.map(({ content }) => vector(content)),
        usage: { tokens: documents.length },
      }),
    },
  });
  await service.initialize();
  close = async (): Promise<void> => {
    service.close();
    await directory.cleanup();
  };
  const entityService: IEntityService = service;
  const shell = createMockShell({ logger, entityService });
  const evalHandlers = new Map<string, (input: unknown) => Promise<unknown>>();
  shell.registerEvalHandler = (_pluginId, id, handler): void => {
    evalHandlers.set(id, handler);
  };
  for (const plugin of plugins) await plugin.register(shell);
  const seeds: Array<{
    id: string;
    entityType: string;
    visibility: "public" | "restricted";
    embedding: Float32Array;
  }> = [
    {
      id: "low-tide",
      entityType: "wish",
      visibility: "public",
      embedding: near(0),
    },
    {
      id: "high-tide",
      entityType: "wish",
      visibility: "restricted",
      embedding: near(0.1),
    },
    {
      id: "bread",
      entityType: "wish",
      visibility: "public",
      embedding: near(1),
    },
    {
      id: "foreign-tide",
      entityType: "other",
      visibility: "public",
      embedding: near(0),
    },
  ];
  for (const seed of seeds) {
    await service.createEntity({
      entity: {
        id: seed.id,
        entityType: seed.entityType,
        content: `About ${seed.id}`,
        metadata: { title: seed.id },
        visibility: seed.visibility,
      },
    });
    const stored = await service.getEntityRaw({
      entityType: seed.entityType,
      id: seed.id,
      visibilityScope: "restricted",
    });
    if (!stored) throw new Error(`Missing ${seed.id}`);
    await service.storeEmbedding({
      entityId: seed.id,
      entityType: seed.entityType,
      embedding: seed.embedding,
      contentHash: stored.contentHash,
    });
  }
  return { service, shell, evals: evalHandlers };
}

function observing(
  resolve: (context: EntityCreateContext) => Promise<unknown>,
): EntityCreateRouting {
  return {
    fromContent: {
      resolve: async (context): Promise<{ refuse: string }> => {
        observed = await resolve(context);
        return { refuse: "observed" };
      },
    },
  };
}

async function create(
  shell: MockShell,
  userPermissionLevel: UserPermissionLevel,
): Promise<void> {
  const interceptor = shell.getEntityRegistry().getCreateInterceptor("wish");
  if (!interceptor) throw new Error("No wish create route");
  await interceptor(
    { entityType: "wish", content: "A tide wish", title: "Tide" },
    {
      interfaceType: "mcp",
      actor: { kind: "service", serviceId: "test" },
      userPermissionLevel,
    },
  );
}

describe("entityRuntime(context) in a create route", () => {
  it("finds the nearest records at the caller's visibility, closest first", async () => {
    const { shell } = await store(
      observing(async (context) =>
        (
          await entityRuntime(context).nearest(wishShape, "a tide wish", {
            maxDistance: 0.5,
          })
        ).map(({ entity, distance }) => [entity.id, distance < 0.5]),
      ),
      {},
    );

    await create(shell, "public");
    expect(observed).toEqual([["low-tide", true]]);

    await create(shell, "admin");
    expect(observed).toEqual([
      ["low-tide", true],
      ["high-tide", true],
    ]);
  });

  it("reads the package's own types at every visibility, and no others", async () => {
    const { shell } = await store(
      observing(async (context) => {
        const runtime = entityRuntime(context);
        const own = await runtime.packageEntities.count(wishShape);
        const foreign = await runtime.packageEntities.count(other).then(
          () => "read",
          (error: unknown) =>
            error instanceof Error && "code" in error ? error.code : "thrown",
        );
        return {
          own,
          foreign,
          visible: await context.entities.count(wishShape),
        };
      }),
      {},
    );

    await create(shell, "public");
    expect(observed).toEqual({
      own: 3,
      foreign: "permission_denied",
      visible: 2,
    });
  });

  it("answers a free-form prompt with a structured object", async () => {
    const { shell } = await store(
      observing(async (context) =>
        entityRuntime(context).generateObject(
          "Do these ask for the same thing?",
          z.object({ same: z.boolean() }),
        ),
      ),
      {},
    );
    const generate = spyOn(shell, "generateObject").mockResolvedValue({
      object: { same: true },
    });

    await create(shell, "public");
    expect(observed).toEqual({ same: true });
    expect(generate).toHaveBeenCalledWith(
      "Do these ask for the same thing?",
      expect.anything(),
      undefined,
    );
  });
});

describe("entityRuntime(context) in an eval", () => {
  it("searches as the package, which reads its own types at every visibility", async () => {
    const { evals } = await store(
      {},
      {
        nearest: async (_input, context) =>
          (
            await entityRuntime(context).nearest(wishShape, "a tide wish", {
              maxDistance: 0.5,
              limit: 5,
            })
          ).map(({ entity }) => entity.id),
      },
    );

    expect(await evals.get("nearest")?.({})).toEqual(["low-tide", "high-tide"]);
  });
});

describe("entityRuntime(context) on a context the runtime did not build", () => {
  it("refuses with an error that says what it is for", () => {
    const double = Object.freeze({ input: {}, entities: {}, uploads: {} });
    expect(() => entityRuntime(double)).toThrow(
      /carries no entity runtime.*first-party packages only/,
    );
  });
});

// What a capability refuses with, thrown or rejected.
async function refusalOf(reach: () => unknown): Promise<string> {
  try {
    await reach();
    return "not refused";
  } catch (error) {
    // The refusal is the value under test.
    return String(error);
  }
}

describe("entityRuntime(context) in a data source", () => {
  // Every type's members of the "tides" series, as a cross-type source reads
  // them, with the types the build names.
  const tides = defineDataSource({
    id: "tides",
    name: "Tides",
    description: "Members of the tides series across every type",
    fetch: async (_query, _entities, context) => {
      const reads = entityRuntime(context).anyEntities;
      const members = await Promise.all(
        reads.getEntityTypes().map((entityType) =>
          reads.listEntities({
            entityType,
            options: { filter: { metadata: { series: "tides" } }, limit: 10 },
          }),
        ),
      );
      const hidden = await reads.getEntity({
        entityType: "other",
        id: "hidden-tide",
      });
      return {
        members: members
          .flat()
          .map(({ id }) => id)
          .sort(),
        hidden: hidden?.id ?? null,
      };
    },
  });
  const output = z.object({
    members: z.array(z.string()),
    hidden: z.string().nullable(),
  });

  async function seeded(): Promise<{
    service: EntityService;
    shell: MockShell;
  }> {
    const installed = await store(
      observing(async () => null),
      {},
      [tides],
    );
    const seeds = [
      { id: "spring-tide", status: "published", visibility: "public" },
      { id: "draft-tide", status: "draft", visibility: "public" },
      { id: "hidden-tide", status: "published", visibility: "restricted" },
    ] as const;
    for (const seed of seeds) {
      await installed.service.createEntity({
        entity: {
          id: seed.id,
          entityType: "other",
          content: `About ${seed.id}`,
          metadata: { title: seed.id, status: seed.status, series: "tides" },
          visibility: seed.visibility,
        },
      });
    }
    return installed;
  }

  async function fetchTides(
    shell: MockShell,
    entityService: IEntityService,
    publishedOnly?: boolean,
  ): Promise<z.output<typeof output>> {
    const source = shell.getDataSourceRegistry().get("@fixture/wishes:tides");
    if (!source?.fetch) throw new Error("No tides data source");
    return source.fetch({}, output, {
      entityService,
      ...(publishedOnly !== undefined && { publishedOnly }),
    });
  }

  it("reads every type at a preview build's scope: public records, drafts included", async () => {
    const { service, shell } = await seeded();
    const preview = scopeEntityReads(service, { visibilityScope: "public" });

    expect(await fetchTides(shell, preview)).toEqual({
      members: ["draft-tide", "spring-tide"],
      hidden: null,
    });
  });

  it("reads only published records at a production build's scope", async () => {
    const { service, shell } = await seeded();
    const production = scopeEntityReads(service, {
      visibilityScope: "public",
      publishedOnly: true,
    });

    expect(await fetchTides(shell, production, true)).toEqual({
      members: ["spring-tide"],
      hidden: null,
    });
  });

  it("never widens the build's scope, whatever a request carries", async () => {
    const wider = defineDataSource({
      id: "wider",
      name: "Wider",
      description: "Asks for more than the build may read",
      fetch: async (_query, _entities, context) => {
        const reads = entityRuntime(context).anyEntities;
        const listing = {
          entityType: "other",
          options: {
            filter: { metadata: { series: "tides" } },
            visibilityScope: "restricted",
            source: true,
          },
          visibilityScope: "restricted",
        };
        const lookup = {
          entityType: "other",
          id: "hidden-tide",
          visibilityScope: "restricted",
        };
        const listed = await reads.listEntities(listing);
        const found = await reads.getEntity(lookup);
        return {
          // A stored-markdown read would hand back the frontmatter too.
          members: listed
            .map(({ id, content }) =>
              content.startsWith("---") ? `${id} (stored markdown)` : id,
            )
            .sort(),
          hidden: found?.id ?? null,
        };
      },
    });
    const installed = await store(
      observing(async () => null),
      {},
      [wider],
    );
    for (const [id, visibility] of [
      ["open-tide", "public"],
      ["hidden-tide", "restricted"],
    ] as const) {
      await installed.service.createEntity({
        entity: {
          id,
          entityType: "other",
          content: `About ${id}`,
          metadata: { title: id, series: "tides" },
          visibility,
        },
      });
    }
    const source = installed.shell
      .getDataSourceRegistry()
      .get("@fixture/wishes:wider");
    if (!source?.fetch) throw new Error("No wider data source");

    expect(
      await source.fetch({}, output, {
        entityService: scopeEntityReads(installed.service, {
          visibilityScope: "public",
        }),
      }),
    ).toEqual({ members: ["open-tide"], hidden: null });
  });

  it("only reads: no writes, and the other capabilities refuse", async () => {
    let refusals: unknown;
    const probe = defineDataSource({
      id: "probe",
      name: "Probe",
      description: "Reaches past the read view",
      fetch: async (_query, _entities, context) => {
        const runtime = entityRuntime(context);
        refusals = {
          reads: Object.keys(runtime.anyEntities).sort(),
          nearest: await refusalOf(() =>
            runtime.nearest(wishShape, "a tide wish"),
          ),
          linkInto: await refusalOf(() =>
            runtime.linkInto("tide", {
              entityType: "other",
              entityId: "foreign-tide",
              field: "coverImageId",
            }),
          ),
          images: await refusalOf(() => runtime.images.canGenerate()),
        };
        return { members: [], hidden: null };
      },
    });
    const { service, shell } = await store(
      observing(async () => null),
      {},
      [probe],
    );
    const source = shell.getDataSourceRegistry().get("@fixture/wishes:probe");
    if (!source?.fetch) throw new Error("No probe data source");
    await source.fetch({}, output, { entityService: service });

    expect(refusals).toEqual({
      reads: ["find", "getEntity", "getEntityTypes", "listEntities"],
      nearest: expect.stringContaining(
        "nearest is not available in a data source",
      ),
      linkInto: expect.stringContaining(
        "linkInto is not available in a data source",
      ),
      images: expect.stringContaining(
        "images is not available in a data source",
      ),
    });
  });

  it("reads any type public in a create route, as the entity plugin classes read targets", async () => {
    const { service, shell } = await store(
      observing(async (context) => {
        const reads = entityRuntime(context).anyEntities;
        return {
          listed: (await reads.listEntities({ entityType: "other" }))
            .map(({ id }) => id)
            .sort(),
          hidden: (await reads.find("other", "hidden-tide"))?.id ?? null,
          found: (await reads.find("other", "foreign-tide"))?.id ?? null,
        };
      }),
      {},
    );
    await service.createEntity({
      entity: {
        id: "hidden-tide",
        entityType: "other",
        content: "About hidden-tide",
        metadata: { title: "hidden-tide" },
        visibility: "restricted",
      },
    });
    await create(shell, "admin");

    expect(observed).toEqual({
      listed: ["foreign-tide"],
      hidden: null,
      found: "foreign-tide",
    });
  });

  it("is refused in an eval, where no read scope across types stands behind it", async () => {
    const { evals } = await store(
      observing(async () => null),
      {
        reads: async (_input, context) =>
          refusalOf(() =>
            entityRuntime(context).anyEntities.listEntities({
              entityType: "other",
            }),
          ),
      },
    );

    expect(await evals.get("reads")?.({})).toEqual(
      expect.stringContaining("anyEntities is not available in an eval"),
    );
  });
});
