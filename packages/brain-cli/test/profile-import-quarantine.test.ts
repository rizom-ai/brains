import { expect, test } from "bun:test";
import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  AnchorProfileAdapter,
  anchorProfileSchema,
} from "@brains/identity-service";
import { DirectorySync } from "@brains/directory-sync";
import { validateProfileEntity } from "@brains/profile";
import { createEntityMirror } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";

test("real profile imports quarantine invalid source across the sanitized mirror but retry live policy", async () => {
  const directory = await createTestDirectory("profile-quarantine");
  const logger = createSilentLogger();
  const dbConfig = { url: `file:${directory.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const registry = EntityRegistry.createFresh(logger);
  registry.registerEntityType(
    "anchor-profile",
    anchorProfileSchema,
    new AnchorProfileAdapter(),
    { classification: "system" },
  );
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
        throw new Error("Unexpected provider call");
      },
      generateEmbeddings: async () => {
        throw new Error("Unexpected provider call");
      },
    },
  });
  try {
    registry.registerPersistValidator("anchor-profile", async (entity) => {
      validateProfileEntity(entity.content);
    });
    const request = { entityType: "anchor-profile", id: "anchor-profile" };
    const placeholder = "---\nname: Starter\n---\n\nPlaceholder.\n";
    await service.createEntity({
      entity: { ...request, content: placeholder, metadata: {} },
    });
    const before = await service.getEntityWriteSnapshot(request);
    expect(before).not.toBeNull();
    const shell = createMockShell({ entityService: service });
    const mirror = createEntityMirror(shell, {
      pluginId: "@brains/directory-sync:directory-sync",
    });
    const syncPath = join(directory.dir, "content");
    const sync = new DirectorySync({
      syncPath,
      entityService: mirror,
      logger,
      autoSync: false,
    });
    await sync.initialize();
    const relativePath = "anchor-profile/anchor-profile.md";
    await mkdir(join(syncPath, "anchor-profile"), { recursive: true });
    const path = join(syncPath, relativePath);
    const invalid =
      "---\nname: PRIVATE_PROFILE_MARKER\nkind: collective\ncustom: preserve-me\n---\n\nPrivate authored body.\n";
    await writeFile(path, invalid);
    const refused = await sync.importEntities([relativePath]);
    expect(refused).toMatchObject({ quarantined: 1, failed: 0 });
    expect(await readFile(`${path}.invalid`, "utf8")).toBe(invalid);
    expect(
      await access(path).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    expect(await service.getEntityWriteSnapshot(request)).toEqual(before);
    expect(
      await readFile(join(syncPath, ".import-errors.log"), "utf8"),
    ).not.toContain("PRIVATE_PROFILE_MARKER");

    let policyAllows = false;
    registry.registerPersistValidator("anchor-profile", async () => {
      // A Zod failure in live policy is persist-phase, not source invalidity.
      z.literal(true).parse(policyAllows);
    });
    const repaired = "---\nname: Authored\n---\n\nKeep this body.\n";
    await writeFile(path, repaired);
    const retryable = await sync.importEntities([relativePath]);
    expect(retryable.failed).toBe(1);
    expect(retryable.quarantined).toBe(0);
    expect(await readFile(path, "utf8")).toBe(repaired);
    expect(await service.getEntityWriteSnapshot(request)).toEqual(before);
    policyAllows = true;
    const imported = await sync.importEntities([relativePath]);
    expect(imported.imported).toBe(1);
    expect(
      (await service.getEntityWriteSnapshot(request))?.entity.content,
    ).toContain("Keep this body.");
    expect(
      await access(`${path}.invalid`).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
  } finally {
    service.close();
    await directory.cleanup();
  }
});
