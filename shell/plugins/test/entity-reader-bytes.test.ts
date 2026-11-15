import { afterEach, describe, expect, it } from "bun:test";
import { SdkError } from "@brains/contracts";
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
import { createEntityReader } from "../src/entity/entity-reader";
import { isDeclaredEntityType } from "../src/test/declared-entity-type";

/**
 * `readBytes` reads an asset-backed record's bytes through the record the
 * reader can see: never by reference, so bytes a restricted record shares
 * with a public one never answer for the restricted one.
 */

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const photo = defineEntity({
  type: "photo",
  purpose: "A photo kept as its bytes.",
  metadata: z.object({ mediaType: z.string().optional() }),
  config: { binaryStorage: "asset", embeddable: false },
});
const note = defineEntity({
  type: "note",
  purpose: "A note.",
  metadata: z.object({ title: z.string() }),
});

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
    defineEntityPackage({ id: "media", entities: [photo, note] }),
    {},
    { name: "@fixture/media", version: "0.1.0" },
  )) {
    if (isDeclaredEntityType(plugin)) {
      registry.registerEntityType(
        plugin.entityType,
        plugin.schema,
        plugin.adapter,
        plugin.entityType === "photo"
          ? { binaryStorage: "asset", embeddable: false }
          : { embeddable: false },
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
      identity: { model: "test:none", dimensions: 8, promptRevision: 0 },
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
  return service;
}

async function addPhoto(
  service: EntityService,
  id: string,
  visibility: "public" | "restricted",
): Promise<void> {
  const staged = await service.stageAsset(PNG);
  await service.createEntity({
    entity: {
      id,
      entityType: "photo",
      content: staged.ref,
      metadata: { mediaType: "image/png" },
      visibility,
    },
    stagedAsset: staged,
  });
}

describe("EntityReader.readBytes", () => {
  it("reads a visible record's bytes with their media type and size", async () => {
    const service = await store();
    await addPhoto(service, "cover", "public");

    const read = await createEntityReader(service, "public").readBytes(
      photo,
      "cover",
    );

    expect(read).toEqual({
      bytes: Uint8Array.from(PNG),
      mediaType: "image/png",
      sizeBytes: PNG.byteLength,
    });
  });

  it("answers a public reader nothing for a restricted record, even one sharing a public record's bytes", async () => {
    const service = await store();
    await addPhoto(service, "private-cover", "restricted");
    await addPhoto(service, "public-twin", "public");
    const reader = createEntityReader(service, "public");

    expect(await reader.readBytes(photo, "private-cover")).toBeNull();
    expect(await reader.readBytes(photo, "public-twin")).not.toBeNull();
    // A reader at the restricted scope sees it.
    expect(
      await createEntityReader(service, "restricted").readBytes(
        photo,
        "private-cover",
      ),
    ).not.toBeNull();
  });

  it("answers nothing for a record with no bytes yet, or none at all", async () => {
    const service = await store();
    await service.createEntity({
      entity: {
        id: "pending",
        entityType: "photo",
        content: "",
        metadata: {},
      },
    });
    const reader = createEntityReader(service, "public");

    expect(await reader.readBytes(photo, "pending")).toBeNull();
    expect(await reader.readBytes(photo, "missing")).toBeNull();
  });

  it("reads a record stored as a data URL before assets", async () => {
    const service = await store();
    await service.createEntity({
      entity: {
        id: "inline",
        entityType: "photo",
        content: `data:image/png;base64,${PNG.toString("base64")}\n`,
        metadata: {},
      },
    });

    expect(
      await createEntityReader(service, "public").readBytes(photo, "inline"),
    ).toEqual({
      bytes: Uint8Array.from(PNG),
      mediaType: "image/png",
      sizeBytes: PNG.byteLength,
    });
  });

  it("refuses a type that stores no bytes", async () => {
    const service = await store();

    const refusal = await createEntityReader(service, "public")
      .readBytes(note, "anything")
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(SdkError);
    expect(refusal).toMatchObject({ code: "invalid_input" });
  });
});
