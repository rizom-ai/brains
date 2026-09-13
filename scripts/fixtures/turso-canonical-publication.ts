// Explicit candidate: bun test --preload ./scripts/fixtures/turso-canonical-preload.ts ./scripts/fixtures/turso-canonical-publication.ts
// Not auto-discovered by test:scripts; not a normal CLI startup acceptance gate.
import { test } from "bun:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  App,
  resolve,
  parseInstanceOverrides,
  registerPackage,
} from "@brains/app";
import defaultSite from "@brains/site-default";
import defaultTheme from "@rizom/theme-default";
import { EntityService } from "@brains/entity-service";
import { createAssetRef } from "@brains/assets";
import { imageSchema, imageAdapter } from "@brains/image";
import { WorkerBinaryPersistence } from "../../shared/db/src/turso-worker/binary-persistence";
import { canonicalBrain } from "../../packages/brain-cli/src/model/canonical-brain";
import {
  canonicalAssetBindings,
  joinCanonicalOwners,
} from "./turso-canonical-preload";

import { exerciseCanonicalPublicationRpc } from "./turso-canonical-publication-rpc";

registerPackage("@brains/site-default", defaultSite);
registerPackage("@rizom/theme-default", defaultTheme);
const SIZE = 2 * 1024 * 1024 + 7;
const SHA = "7e669b7062e7303b6b89603b041faaa151e9c0e37fed549258a422760a734962";

test("canonical App binds a real file claim in its entity transaction and downloads every image byte", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "turso-canonical-publication-"),
  );
  console.error(`[canonical-publication] retained fixture: ${directory}`);
  const sourceFile = join(directory, "canonical.png");
  // Exact canonical fixture generation only. The publication carries no bytes.
  const bytes = Buffer.alloc(SIZE);
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ).copy(bytes);
  await writeFile(sourceFile, bytes);
  const resolveConfig = (): ReturnType<typeof resolve> =>
    resolve(
      canonicalBrain,
      { AI_API_KEY: "test-key" },
      parseInstanceOverrides(`brain: brain
bundleContract: capability-bundles-v1
anchor: person
kind: professional
bundles: [core, media, automation, web, chat, site, publishing, federation, team]
site:
  package: "@brains/site-default"
  theme: "@rizom/theme-default"
plugins:
  directory-sync:
    autoSync: false
    initialSync: false
    seedContent: false
  topics:
    enableAutoExtraction: false
  site-builder:
    autoRebuild: false
`),
    );
  const url = pathToFileURL(join(directory, "entities.db")).href;
  const endpoint = {
    address: join(directory, "owner.sock"),
    secret: randomUUID() + randomUUID(),
    sessionId: "owner",
  };
  const createApp = (): App => {
    const config = resolveConfig();
    return App.create({
      ...config,
      shellConfig: {
        ...config.shellConfig,
        database: { url },
        jobQueueDatabase: {
          url: pathToFileURL(join(directory, "jobs.db")).href,
        },
        conversationDatabase: {
          url: pathToFileURL(join(directory, "conversations.db")).href,
        },
        runtimeStateDatabase: {
          url: pathToFileURL(join(directory, "runtime-state.db")).href,
        },
        embedding: { enabled: false },
        dataDir: join(directory, "content"),
        logging: { level: "error" },
      },
    });
  };
  const shutdownChecks: (() => void)[] = [];
  const app = createApp();
  const record = { ref: createAssetRef(SHA), digest: SHA, sizeBytes: SIZE };
  try {
    await app.migrate();
    await app.initialize(
      { mode: "register-only" },
      {
        migrationsCompleted: true,
        processRole: "web",
        localDatabaseEndpoint: endpoint,
      },
    );
    assert.deepEqual(app.getShell().getPluginManager().getFailedPlugins(), []);
    const owner = app.getShell().getEntityService();
    assert.ok(owner instanceof EntityService);
    const binding = canonicalAssetBindings(url);
    shutdownChecks.push(() => assert.equal(binding.binary.closed, true));
    assert.ok(binding.binary instanceof WorkerBinaryPersistence);
    // Known fixture metadata, not a claim that image inspection callers migrated.
    const entity = imageAdapter.createImageEntity({
      facts: {
        ...record,
        format: "png",
        mediaType: "image/png",
        width: 1,
        height: 1,
      },
      title: "Canonical file publication",
      status: "draft",
    });
    const primary = new Error(
      "fault after real entity, export and journal writes before native commit",
    );
    await assert.rejects(
      binding.withFile(
        sourceFile,
        SIZE,
        SHA,
        (publication) =>
          owner.createEntityWithPublication(publication, {
            entity: { ...entity, id: "rolled-back" },
          }),
        async (context) => {
          assert.deepEqual(
            await binding.publicationRows("rolled-back", context),
            { entity: 1, exportIntent: 1, dirty: 1 },
          );
          throw primary;
        },
      ),
      (error: unknown) => error === primary,
    );
    binding.assertTransferIdle();
    assert.equal(await owner.statAsset(record.ref), null);
    assert.deepEqual(await binding.publicationRows("rolled-back"), {
      entity: 0,
      exportIntent: 0,
      dirty: 0,
    });
    for (const id of ["canonical-image", "deduplicated-image"]) {
      await binding.withFile(sourceFile, SIZE, SHA, (publication) =>
        owner.createEntityWithPublication(publication, {
          entity: { ...entity, id },
        }),
      );
      binding.assertTransferIdle();
      const stored = imageSchema.parse(
        await owner.getEntityRaw({
          entityType: "image",
          id,
          visibilityScope: "restricted",
        }),
      );
      assert.equal(stored.content, record.ref);
      assert.equal(stored.metadata.sizeBytes, SIZE);
    }
    await exerciseCanonicalPublicationRpc(
      binding,
      endpoint,
      sourceFile,
      SIZE,
      SHA,
      { ...entity, id: "rpc-image" },
    );
    const rpcImage = imageSchema.parse(
      await owner.getEntityRaw({
        entityType: "image",
        id: "rpc-image",
        visibilityScope: "restricted",
      }),
    );
    assert.equal(rpcImage.content, record.ref);
    assert.equal(rpcImage.metadata.sizeBytes, SIZE);
    await binding.verifyDownload(record);
    binding.assertTransferIdle();
    assert.deepEqual(await owner.statAsset(record.ref), {
      ref: record.ref,
      sizeBytes: SIZE,
    });
    console.error(
      "[canonical-publication] native rollback, publication, deduplication and full consumer digest passed; runtime database factory/caller cutover not exercised",
    );
  } finally {
    await app.stop();
  }
  for (const check of shutdownChecks) check();
  // App.stop requesting close is not proof of native exit. Join before reopening.
  await joinCanonicalOwners();
  const restarted = createApp();
  try {
    await restarted.initialize(
      { mode: "register-only" },
      {
        migrationsCompleted: true,
        processRole: "web",
        localDatabaseEndpoint: endpoint,
      },
    );
    assert.deepEqual(
      restarted.getShell().getPluginManager().getFailedPlugins(),
      [],
    );
    const owner = restarted.getShell().getEntityService();
    for (const id of ["canonical-image", "deduplicated-image", "rpc-image"]) {
      const stored = imageSchema.parse(
        await owner.getEntityRaw({
          entityType: "image",
          id,
          visibilityScope: "restricted",
        }),
      );
      assert.equal(stored.content, record.ref);
      assert.equal(stored.metadata.sizeBytes, SIZE);
    }
    const binding = canonicalAssetBindings(url);
    shutdownChecks.push(() => assert.equal(binding.binary.closed, true));
    await binding.verifyDownload(record);
    binding.assertTransferIdle();
    assert.deepEqual(await binding.publicationRows("rolled-back"), {
      entity: 0,
      exportIntent: 0,
      dirty: 0,
    });
    console.error(
      "[canonical-publication] full image download after joined-owner restart passed; not main-file-only restore or installed startup acceptance",
    );
  } finally {
    await restarted.stop();
  }
  for (const check of shutdownChecks) check();
});
