import { afterEach, describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
} from "../src";
import { isDeclaredEntityType } from "../src/test/declared-entity-type";

/**
 * A type that declares `binaryStorage` keeps binary content: it stores the
 * content unchanged with no frontmatter, its metadata lives beside it in the
 * metadata column, and its codec says only what the bytes say, which an
 * import merges with the metadata it was handed.
 */

// A 1x1 PNG, and another, as data URLs.
const ONE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TWO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const pictureMetadata = z.object({
  title: z.string(),
  alt: z.string(),
  format: z.string(),
});

const picture = defineEntity({
  type: "picture",
  purpose: "A picture kept as its bytes.",
  metadata: pictureMetadata,
  config: { binaryStorage: "data-url", embeddable: false },
  markdown: {
    // The bytes say their format; the title and alt arrive beside them.
    decode: ({ content }) => ({
      content,
      metadata: {
        format: content.slice(content.indexOf("/") + 1, content.indexOf(";")),
      },
    }),
  },
});

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function store(): Promise<{
  service: EntityService;
  registry: EntityRegistry;
  stored(id: string): Promise<{ content: string; metadata: unknown } | null>;
}> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "pictures", entities: [picture] }),
    {},
    { name: "@fixture/pictures", version: "0.1.0" },
  )) {
    if (isDeclaredEntityType(plugin)) {
      registry.registerEntityType(
        plugin.entityType,
        plugin.schema,
        plugin.adapter,
        { binaryStorage: "data-url", embeddable: false },
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
      identity: { model: "test:none", dimensions: 1536, promptRevision: 0 },
      embedQuery: async () => {
        throw new Error("Unexpected embedding");
      },
      embedDocuments: async () => {
        throw new Error("Unexpected embedding");
      },
    },
  });
  await service.initialize();
  const db = createClient(dbConfig);
  close = async (): Promise<void> => {
    db.close();
    service.close();
    await directory.cleanup();
  };
  return {
    service,
    registry,
    async stored(id): Promise<{ content: string; metadata: unknown } | null> {
      const result = await db.execute({
        sql: "SELECT content, metadata FROM entities WHERE entityType = 'picture' AND id = ?",
        args: [id],
      });
      const row = result.rows[0];
      return row
        ? {
            content: String(row["content"]),
            metadata: JSON.parse(String(row["metadata"])),
          }
        : null;
    },
  };
}

const metadata = { title: "Dot", alt: "A dot", format: "png" };

describe("a declared type with binary storage", () => {
  it("stores and reads back its content byte for byte, with its metadata beside it", async () => {
    const { service, stored } = await store();
    await service.createEntity({
      entity: { id: "dot", entityType: "picture", content: ONE, metadata },
    });

    expect(await stored("dot")).toEqual({ content: ONE, metadata });
    const read = await service.getEntity({ entityType: "picture", id: "dot" });
    expect(read?.content).toBe(ONE);
    expect(read?.metadata).toEqual(metadata);
  });

  it("keeps its metadata through the startup reconcile", async () => {
    const { service, stored } = await store();
    await service.createEntity({
      entity: { id: "dot", entityType: "picture", content: ONE, metadata },
    });

    expect(await service.reconcileDeclaredMetadata()).toEqual({
      reconciled: 0,
    });
    expect(await stored("dot")).toEqual({ content: ONE, metadata });
  });

  it("keeps its metadata through an update of its content alone", async () => {
    const { service, stored } = await store();
    await service.createEntity({
      entity: { id: "dot", entityType: "picture", content: ONE, metadata },
    });
    const read = await service.getEntity({ entityType: "picture", id: "dot" });
    if (!read) throw new Error("Missing picture");

    await service.updateEntity({ entity: { ...read, content: TWO } });

    expect(await stored("dot")).toEqual({ content: TWO, metadata });
  });

  it("decodes what the bytes say, which an import merges with the metadata it was handed", async () => {
    const { service, registry, stored } = await store();
    const decoded = registry.getAdapter("picture").fromMarkdown(ONE);
    expect(decoded).toEqual({
      entityType: "picture",
      content: ONE,
      metadata: { format: "png" },
    });

    await service.createEntity({
      entity: {
        id: "imported",
        entityType: "picture",
        content: decoded.content ?? "",
        metadata: { ...decoded.metadata, title: "Dot", alt: "A dot" },
      },
    });

    expect(await stored("imported")).toEqual({ content: ONE, metadata });
  });

  it("leaves the metadata to the import when the bytes say nothing", () => {
    const blob = defineEntity({
      type: "blob",
      purpose: "Bytes that say nothing about themselves.",
      metadata: z.object({ filename: z.string() }),
      config: { binaryStorage: "data-url" },
      markdown: { decode: ({ content }) => ({ content, metadata: {} }) },
    });
    const [plugin] = instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "blobs", entities: [blob] }),
      {},
      { name: "@fixture/blobs", version: "0.1.0" },
    );
    if (!isDeclaredEntityType(plugin)) throw new Error("No blob plugin");

    expect(plugin.adapter.fromMarkdown(ONE)).toEqual({
      entityType: "blob",
      content: ONE,
    });
  });

  it("validates the merged metadata when it is stored", () => {
    return store().then(({ service }) =>
      expect(
        service.createEntity({
          entity: {
            id: "untitled",
            entityType: "picture",
            content: ONE,
            metadata: { format: "png" },
          },
        }),
      ).rejects.toThrow(),
    );
  });

  it("refuses a cover image, which binary content cannot carry", () => {
    expect(() =>
      defineEntity({
        type: "covered-picture",
        purpose: "A picture with a cover.",
        metadata: pictureMetadata,
        config: { binaryStorage: "data-url" },
        coverImage: true,
      }),
    ).toThrow(/binary content.*cover image/);
  });
});
