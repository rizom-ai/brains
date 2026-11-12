import { afterEach, describe, expect, it } from "bun:test";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  EntityPlugin,
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  withPublishedStatuses,
} from "../src";

/**
 * A first-party declared type whose published statuses are not the default
 * lifecycle publishes exactly those to a published-only read (a production
 * site build), as its class's adapter declared them: an agent directory
 * publishes approved agents, never discovered or archived ones. The
 * statuses are independent of the publish-action policy (config.publish).
 */

const contact = withPublishedStatuses(
  defineEntity({
    type: "contact",
    purpose: "A saved contact.",
    metadata: z.object({
      name: z.string(),
      status: z.enum(["discovered", "approved", "archived"]),
    }),
  }),
  ["approved"],
);

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function store(): Promise<EntityService> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "contacts", entities: [contact] }),
    {},
    { name: "@fixture/contacts", version: "0.1.0" },
  )) {
    if (plugin instanceof EntityPlugin)
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
      identity: { model: "test:none", dimensions: 1536, promptRevision: 0 },
      embedQuery: async (): Promise<never> => {
        throw new Error("Unexpected embedding");
      },
      embedDocuments: async (): Promise<never> => {
        throw new Error("Unexpected embedding");
      },
    },
  });
  await service.initialize();
  close = async (): Promise<void> => {
    service.close();
    await directory.cleanup();
  };
  return service;
}

describe("a first-party declared type's published statuses", () => {
  it("are what a published-only read publishes", async () => {
    const service = await store();
    for (const status of ["discovered", "approved", "archived"] as const) {
      await service.createEntity({
        entity: {
          id: status,
          entityType: "contact",
          content: "",
          metadata: { name: status, status },
          visibility: "public",
        },
      });
    }

    const published = await service.listEntities({
      entityType: "contact",
      options: { publishedOnly: true },
    });
    expect(published.map(({ id }) => id)).toEqual(["approved"]);
    expect(
      await service.getEntityRaw({
        entityType: "contact",
        id: "discovered",
        publishedOnly: true,
      }),
    ).toBeNull();
  });

  it("leave the publish-action policy alone", async () => {
    const [plugin] = instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "contacts", entities: [contact] }),
      {},
      { name: "@fixture/contacts", version: "0.1.0" },
    );
    expect(
      plugin instanceof EntityPlugin && plugin.adapter.publishedStatuses,
    ).toEqual(["approved"]);
    const shell = createMockShell();
    await plugin?.register(shell);
    expect(
      shell.getEntityRegistry().getEntityTypeConfig("contact").publish,
    ).toBeUndefined();
  });

  it("are refused when empty", () => {
    expect(() =>
      withPublishedStatuses(
        defineEntity({
          type: "memo",
          purpose: "A memo.",
          metadata: z.object({ status: z.string() }),
        }),
        [],
      ),
    ).toThrow(/at least one status/);
  });
});
