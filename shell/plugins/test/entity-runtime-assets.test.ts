import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import { defineJobContract, type ActorRef } from "@brains/contracts";
import type { CallerPrincipal } from "@brains/content-service";
import {
  EntityRegistry,
  EntityService,
  parseAssetRef,
  type IEntityService,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import type { JobHandler } from "@brains/job-queue";
import {
  createSilentLogger,
  createMockProgressReporter,
  createTestDirectory,
} from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  contractJob,
  defineEntity,
  defineEntityPackage,
  entityRuntime,
  instantiatePluginPackageDefinition,
  type EntityDefinition,
} from "../src";
import { isDeclaredEntityType } from "../src/test/declared-entity-type";

/**
 * A contract job of an asset-backed type stages bytes and saves them as a
 * record of its own type, the bytes published in that record's mutation.
 * Bytes are read through a record the call can see, never by reference.
 */

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7]);

const pictureMetadata = z.object({
  title: z.string().min(1),
  status: z.enum(["pending", "draft"]).optional(),
});

const actionSchema = z.object({
  action: z.enum([
    "save",
    "save-other-type",
    "save-invalid",
    "get-stored",
    "rename",
    "read-photo",
    "any-get-reference",
  ]),
  id: z.string(),
});

const saveContract = defineJobContract({
  type: "pictures:act",
  input: actionSchema,
});

let seen: unknown;

const photoMetadata = z.object({ title: z.string() });
const photo = defineEntity({
  type: "photo",
  purpose: "Another package's asset-backed photo.",
  metadata: photoMetadata,
  config: { binaryStorage: "asset", embeddable: false },
});

const picture: EntityDefinition<"picture", typeof pictureMetadata> =
  defineEntity({
    type: "picture",
    purpose: "A picture kept as an asset.",
    metadata: pictureMetadata,
    config: { binaryStorage: "asset", embeddable: false },
    jobs: {
      act: contractJob(saveContract, {
        handle: async (context) => {
          const { input, entities } = context;
          const assets = entityRuntime(context).assets;
          switch (input.action) {
            case "save": {
              const staged = await assets.stage(PNG);
              seen = await assets.save(
                picture,
                input.id,
                { metadata: { title: input.id, status: "draft" } },
                staged,
              );
              return {};
            }
            case "save-other-type": {
              const staged = await assets.stage(PNG);
              await assets.save(
                photo,
                input.id,
                { metadata: { title: input.id } },
                staged,
              );
              return {};
            }
            case "save-invalid": {
              const staged = await assets.stage(PNG);
              await assets.save(
                picture,
                input.id,
                // An empty title: the record is refused, the bytes unpublished.
                { metadata: { title: "", status: "draft" } },
                staged,
              );
              return {};
            }
            case "get-stored":
              seen = await assets.getStored(picture, input.id);
              return {};
            case "rename": {
              const current = await entities.get(picture, input.id);
              if (!current) throw new Error("missing");
              await entities.update(picture, current, {
                metadata: { ...current.metadata, title: "Renamed" },
              });
              return {};
            }
            case "read-photo": {
              const bytes = await assets.read(photo, input.id);
              seen = bytes ? Buffer.from(bytes) : null;
              return {};
            }
            case "any-get-reference":
              seen = await entityRuntime(context).anyEntities.getEntity({
                entityType: "picture",
                id: input.id,
              });
              return {};
          }
        },
      }),
    },
  });

const DIMENSIONS = 8;
let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
  seen = undefined;
});

async function install(): Promise<{
  shell: MockShell;
  service: EntityService;
  db: Client;
}> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  const plugins = [
    ...instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "pictures", entities: [picture] }),
      {},
      { name: "@fixture/pictures", version: "0.1.0" },
      { pluginId: "pictures" },
    ),
    ...instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "photos", entities: [photo] }),
      {},
      { name: "@fixture/photos", version: "0.1.0" },
    ),
  ];
  for (const plugin of plugins) {
    if (isDeclaredEntityType(plugin)) {
      registry.registerEntityType(
        plugin.entityType,
        plugin.schema,
        plugin.adapter,
        { binaryStorage: "asset", embeddable: false },
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
      identity: {
        model: "test:mock",
        dimensions: DIMENSIONS,
        promptRevision: 0,
      },
      embedQuery: async () => ({
        embedding: new Float32Array(DIMENSIONS),
        usage: { tokens: 1 },
      }),
      embedDocuments: async (documents: { content: string }[]) => ({
        embeddings: documents.map(() => new Float32Array(DIMENSIONS)),
        usage: { tokens: documents.length },
      }),
    },
  });
  await service.initialize();
  const db = createClient(dbConfig);
  close = async (): Promise<void> => {
    db.close();
    service.close();
    await directory.cleanup();
  };
  const entityService: IEntityService = service;
  const shell = createMockShell({
    logger,
    entityService,
    dataDir: directory.dir,
    resolvePrincipal: mock(
      async (_actor: ActorRef): Promise<CallerPrincipal | null> => null,
    ),
  });
  for (const plugin of plugins) await plugin.register(shell);
  return { shell, service, db };
}

async function run(
  shell: MockShell,
  data: z.input<typeof actionSchema>,
): Promise<unknown> {
  const job: JobHandler | undefined = shell
    .getJobQueueService()
    .getHandler("pictures:act");
  if (!job) throw new Error("No handler");
  const parsed = job.validateAndParse(data);
  if (parsed === null) throw new Error("Invalid contract job data");
  return job.process(
    parsed,
    "job-1",
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

async function count(db: Client, table: string): Promise<number> {
  const result = await db.execute(`SELECT count(*) AS n FROM ${table}`);
  return Number(result.rows[0]?.["n"] ?? 0);
}

async function storedContent(
  db: Client,
  id: string,
): Promise<string | undefined> {
  const result = await db.execute({
    sql: "SELECT content FROM entities WHERE id = ?",
    args: [id],
  });
  const content = result.rows[0]?.["content"];
  return typeof content === "string" ? content : undefined;
}

describe("entity runtime assets", () => {
  it("saves staged bytes as a new record of the declaring type", async () => {
    const { shell, service, db } = await install();

    await run(shell, { action: "save", id: "first" });

    const content = await storedContent(db, "first");
    expect(content).toMatch(/^asset:\/\/sha256\/[0-9a-f]{64}$/);
    expect(seen).toEqual({ entityId: "first" });
    expect(await count(db, "assets")).toBe(1);
    if (!content?.startsWith("asset://")) throw new Error("no reference");
    expect(
      Buffer.from(await service.readAsset(parseAssetRef(content))),
    ).toEqual(PNG);
  });

  it("saves over an existing record, such as a pending placeholder", async () => {
    const { shell, service, db } = await install();
    await service.createEntity({
      entity: {
        id: "pending",
        entityType: "picture",
        content: "",
        metadata: { title: "pending", status: "pending" },
        visibility: "restricted",
      },
    });

    await run(shell, { action: "save", id: "pending" });

    expect(await storedContent(db, "pending")).toMatch(/^asset:\/\//);
    const saved = await service.getEntity({
      entityType: "picture",
      id: "pending",
      visibilityScope: "restricted",
    });
    expect(saved?.metadata).toEqual({ title: "pending", status: "draft" });
    expect(saved?.visibility).toBe("restricted");
  });

  it("reads any type's record as its stored reference", async () => {
    const { shell } = await install();
    await run(shell, { action: "save", id: "first" });

    await run(shell, { action: "any-get-reference", id: "first" });

    expect(z.object({ content: z.string() }).parse(seen).content).toMatch(
      /^asset:\/\/sha256\//,
    );
  });

  it("refuses to save another type's record and publishes nothing", async () => {
    const { shell, db } = await install();

    const refusal = await run(shell, {
      action: "save-other-type",
      id: "foreign",
    }).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(Error);
    expect(String(refusal)).toContain(
      'A picture job may only write picture records, and "photo" is not its type',
    );
    expect(await storedContent(db, "foreign")).toBeUndefined();
    expect(await count(db, "assets")).toBe(0);
    expect(await count(db, "asset_uploads")).toBe(0);
  });

  it("publishes the bytes only with the record: a refused write leaves no asset", async () => {
    const { shell, db } = await install();

    const refusal = await run(shell, {
      action: "save-invalid",
      id: "invalid",
    }).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(Error);
    expect(String(refusal)).toContain("Invalid picture metadata");
    expect(await storedContent(db, "invalid")).toBeUndefined();
    expect(await count(db, "assets")).toBe(0);
    expect(await count(db, "asset_uploads")).toBe(0);
  });

  it("reads the stored reference without loading bytes", async () => {
    const { shell, db } = await install();
    await run(shell, { action: "save", id: "kept" });

    await run(shell, { action: "get-stored", id: "kept" });

    const kept = await storedContent(db, "kept");
    expect(kept).toMatch(/^asset:\/\//);
    expect(z.object({ content: z.string() }).parse(seen).content).toBe(
      kept ?? "",
    );
  });

  it("keeps the reference when the record's metadata alone is updated", async () => {
    const { shell, db } = await install();
    await run(shell, { action: "save", id: "renamed" });
    const before = await storedContent(db, "renamed");

    await run(shell, { action: "rename", id: "renamed" });

    expect(await storedContent(db, "renamed")).toBe(before);
  });

  it("reads another type's bytes only through a record the call can see", async () => {
    const { shell, service } = await install();
    for (const [id, visibility] of [
      ["public-photo", "public"],
      ["restricted-photo", "restricted"],
    ] as const) {
      const staged = await service.stageAsset(PNG);
      await service.createEntity({
        entity: {
          id,
          entityType: "photo",
          content: staged.ref,
          metadata: { title: id },
          visibility,
        },
        stagedAsset: staged,
      });
    }

    await run(shell, { action: "read-photo", id: "public-photo" });
    expect(seen).toEqual(PNG);
    // The same bytes back a restricted photo, which the job cannot see.
    await run(shell, { action: "read-photo", id: "restricted-photo" });
    expect(seen).toBeNull();
  });
});
