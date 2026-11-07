import { afterEach, describe, expect, it, spyOn } from "bun:test";
import {
  EntityRegistry,
  EntityService,
  type IEntityService,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  EntityPlugin,
  defineEntity,
  defineEntityPackage,
  entityRuntime,
  instantiatePluginPackageDefinition,
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
const other = defineEntity({
  type: "other",
  purpose: "Another package's type.",
  metadata: note,
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
      defineEntityPackage({ id: "wishes", entities: [wish] }),
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
      dimensions: DIMENSIONS,
      generateEmbedding: async (text: string) => ({
        embedding: vector(text),
        usage: { tokens: 1 },
      }),
      generateEmbeddings: async (texts: string[]) => ({
        embeddings: texts.map(vector),
        usage: { tokens: texts.length },
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
