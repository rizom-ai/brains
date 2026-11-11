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
} from "../src";

/**
 * A declared type handed a whole document, as an import or an editor hands
 * one: its frontmatter, decoded into the metadata, is written back in the
 * type's own order, as an entity plugin class's adapter wrote it, and the
 * frontmatter the type does not write is kept after it.
 */

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

const memo = defineEntity({
  type: "memo",
  purpose: "A memo.",
  metadata: z.object({
    title: z.string(),
    status: z.string(),
    note: z.string().optional(),
  }),
  markdown: {
    decode: ({ content, frontmatter }) => ({
      content,
      metadata: z
        .object({
          title: z.string(),
          status: z.string(),
          note: z.string().optional(),
        })
        .parse(frontmatter),
    }),
    encode: ({ content, metadata }) => ({
      content,
      frontmatter: {
        title: metadata.title,
        status: metadata.status,
        ...(metadata.note !== undefined && { note: metadata.note }),
      },
    }),
  },
});

async function store(): Promise<{
  service: EntityService;
  stored: (id: string) => Promise<string>;
}> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "memos", entities: [memo] }),
    {},
    { name: "@fixture/memos", version: "0.1.0" },
  )) {
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
    embeddingsEnabled: false,
    embeddingService: {
      identity: { model: "test:mock", dimensions: 1536, promptRevision: 0 },
      embedQuery: async () => {
        throw new Error("Unexpected embedding");
      },
      embedDocuments: async () => {
        throw new Error("Unexpected embedding");
      },
    },
  });
  await service.initialize();
  close = async (): Promise<void> => {
    service.close();
    await directory.cleanup();
  };
  return {
    service,
    // The stored document, as the entity store holds it.
    stored: async (id) =>
      (
        await service.getEntity({
          entityType: "memo",
          id,
          visibilityScope: "restricted",
          source: true,
        })
      )?.content ?? "",
  };
}

describe("a declared type handed a whole document", () => {
  it("writes its frontmatter in its own order, keeping what it does not write after it", async () => {
    const { service, stored } = await store();
    await service.createEntityFromMarkdown({
      input: {
        entityType: "memo",
        id: "memo-1",
        markdown:
          "---\nchecksum: seed\nstatus: draft\nnote: kept\ntitle: Memo\n---\nBody\n",
      },
    });
    expect(await stored("memo-1")).toBe(
      "---\ntitle: Memo\nstatus: draft\nnote: kept\nchecksum: seed\n---\nBody\n",
    );
  });

  it("does so on an update that carries a whole document too", async () => {
    const { service, stored } = await store();
    await service.createEntityFromMarkdown({
      input: {
        entityType: "memo",
        id: "memo-1",
        markdown: "---\ntitle: Memo\nstatus: draft\n---\nBody\n",
      },
    });
    const read = await service.getEntity({ entityType: "memo", id: "memo-1" });
    if (!read) throw new Error("Missing memo");
    await service.updateEntity({
      entity: {
        ...read,
        content: "---\nstatus: queued\ntitle: Memo\n---\nRetold\n",
      },
    });
    expect(await stored("memo-1")).toBe(
      "---\ntitle: Memo\nstatus: queued\n---\nRetold\n",
    );
  });
});
