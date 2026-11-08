import { afterEach, describe, expect, it } from "bun:test";
import {
  EntityRegistry,
  EntityService,
  type IEntityService,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  EntityPlugin,
  defineEntity,
  defineEntityPackage,
  entityRuntime,
  instantiatePluginPackageDefinition,
  type EntityCreateRouting,
  type ToolContext,
  type ToolResponse,
} from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createEntityCreateTool } from "../../src/system/entity-create-tool";
import { createMockSystemServices } from "./mock-services";

/**
 * A first-party create route that hands a request on to the ordinary
 * create (entityRuntime(context).ordinaryCreate), as an entity plugin's
 * interceptor continued it: system_create stores the document through the
 * direct create, its id from the title and made unique.
 */

const pageMetadata = z.object({ title: z.string(), section: z.string() });

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

const context: ToolContext = {
  interfaceType: "test",
  actor: { kind: "user", userId: "editor" },
  userPermissionLevel: "admin",
};

async function systemCreate(create: EntityCreateRouting): Promise<{
  run(input: Record<string, unknown>): Promise<ToolResponse>;
  service: EntityService;
}> {
  const page = defineEntity({
    type: "page",
    purpose: "A page filed in a section.",
    metadata: pageMetadata,
    create,
  });
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "pages", entities: [page] }),
    {},
    { name: "@fixture/pages", version: "0.1.0" },
  );
  for (const plugin of plugins) {
    if (!(plugin instanceof EntityPlugin)) throw new Error("No entity plugin");
    registry.registerEntityType(
      plugin.entityType,
      plugin.schema,
      plugin.adapter,
    );
  }
  const dbConfig = { url: `file:${directory.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService: {
      dimensions: 1536,
      generateEmbedding: async () => {
        throw new Error("Unexpected embedding");
      },
      generateEmbeddings: async () => {
        throw new Error("Unexpected embedding");
      },
    },
  });
  await service.initialize();
  close = async (): Promise<void> => {
    service.close();
    await directory.cleanup();
  };
  const entityService: IEntityService = service;
  const shell = createMockShell({ logger, entityService });
  for (const plugin of plugins) await plugin.register(shell);
  const tool = createEntityCreateTool(
    createMockSystemServices({
      entityRegistry: shell.getEntityRegistry(),
      entityService: service,
    }),
  );
  const run = async (input: Record<string, unknown>): Promise<ToolResponse> => {
    const first = await tool.handler(input, context);
    if (!("needsConfirmation" in first)) return first;
    return tool.handler(
      z.record(z.string(), z.unknown()).parse(first.args),
      context,
    );
  };
  return { run, service };
}

const complete = "---\ntitle: Rotating keys\nsection: Ops\n---\n\nKeys rotate.";

describe("a create route handing on to the ordinary create", () => {
  it("stores a complete document through the direct create, its id made unique", async () => {
    const { run, service } = await systemCreate({
      fromContent: {
        resolve: async (create) => entityRuntime(create).ordinaryCreate(),
      },
    });

    const save = (replace: boolean): Promise<ToolResponse> =>
      run({
        entityType: "page",
        title: "Rotating keys",
        source: { kind: "text", content: complete },
        ...(replace && { replace: true }),
      });
    expect(await save(false)).toMatchObject({ success: true });
    // A second copy asked for on purpose takes the suffix the direct create
    // gives a taken id.
    expect(await save(true)).toMatchObject({ success: true });

    const pages = await service.listEntities({
      entityType: "page",
      options: { filter: { visibilityScope: "restricted" } },
    });
    expect(pages.map(({ id }) => id).sort()).toEqual([
      "rotating-keys",
      "rotating-keys-2",
    ]);
    expect(pages.map(({ metadata }) => metadata)).toEqual([
      { title: "Rotating keys", section: "Ops" },
      { title: "Rotating keys", section: "Ops" },
    ]);
  });

  it("stores the document the route completed in place of the request's", async () => {
    const { run, service } = await systemCreate({
      fromContent: {
        resolve: async (create) =>
          entityRuntime(create).ordinaryCreate({
            title: "Rotating keys",
            content:
              "---\ntitle: Rotating keys\nsection: Handbook\n---\n\nKeys rotate.",
          }),
      },
    });

    expect(
      await run({
        entityType: "page",
        source: { kind: "text", content: "# Rotating keys\n\nKeys rotate." },
      }),
    ).toMatchObject({ success: true });

    expect(
      (
        await service.getEntity({
          entityType: "page",
          id: "rotating-keys",
          visibilityScope: "restricted",
        })
      )?.metadata,
    ).toEqual({ title: "Rotating keys", section: "Handbook" });
  });

  it("is no hand-off when a route builds the answer itself", async () => {
    // The hand-off is marked by the runtime's accessor alone; an answer
    // built by hand, as a third-party route would, is the refusal it reads as.
    const { run, service } = await systemCreate({
      fromContent: {
        resolve: async () => ({
          refuse:
            "This create hands on to the ordinary create, which only the brain's runtime performs",
        }),
      },
    });

    expect(
      await run({
        entityType: "page",
        title: "Rotating keys",
        source: { kind: "text", content: complete },
      }),
    ).toMatchObject({ success: false });
    expect(
      await service.listEntities({
        entityType: "page",
        options: { filter: { visibilityScope: "restricted" } },
      }),
    ).toEqual([]);
  });
});
