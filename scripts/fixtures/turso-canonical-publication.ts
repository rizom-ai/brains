// Explicit candidate: bun test --preload ./scripts/fixtures/turso-canonical-preload.ts ./scripts/fixtures/turso-canonical-publication.ts
// Not auto-discovered by test:scripts; not a normal CLI startup acceptance gate.
import { test, spyOn } from "bun:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createSilentLogger } from "@brains/test-utils";
import { CallbackProgressReporter } from "@brains/utils/progress";
import { RuntimeUploadStore } from "../../shell/plugins/src/service/upload-registry";
import { webChatUploadsScope } from "../../entities/image/src/lib/upload-promotion";
import { DirectorySync } from "../../plugins/directory-sync/src/lib/directory-sync";
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

import {
  exerciseCanonicalPublicationRpc,
  exerciseCanonicalReadRpc,
} from "./turso-canonical-publication-rpc";

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
  const fileActors = {
    remoteDownloadUrl: new URL(
      "../../shared/image/src/remote-image-process.ts",
      import.meta.url,
    ),
    executable: process.execPath,
    uploadUrl: new URL(
      "../../shared/db/src/turso-worker/file-upload-process.ts",
      import.meta.url,
    ),
    downloadUrl: new URL(
      "../../shared/db/src/turso-worker/file-download-process.ts",
      import.meta.url,
    ),
    inspectionUploadUrl: new URL(
      "../../shared/image/src/file-inspection-process.ts",
      import.meta.url,
    ),
  };
  const record = { ref: createAssetRef(SHA), digest: SHA, sizeBytes: SIZE };
  try {
    await app.migrate();
    await app.initialize(
      { mode: "register-only" },
      {
        migrationsCompleted: true,
        processRole: "web",
        localDatabaseEndpoint: endpoint,
        fileActors,
      },
    );
    assert.deepEqual(app.getShell().getPluginManager().getFailedPlugins(), []);
    const owner = app.getShell().getEntityService();
    assert.ok(owner instanceof EntityService);
    const binding = canonicalAssetBindings(url);
    shutdownChecks.push(() => assert.equal(binding.binary.closed, true));
    assert.ok(binding.binary instanceof WorkerBinaryPersistence);
    assert.ok(owner.fileAssets);
    // The following fixtures still supply metadata to isolate transaction faults.
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
    const importRoot = join(directory, "local-import");
    await mkdir(join(importRoot, "image"), { recursive: true });
    await copyFile(sourceFile, join(importRoot, "image", "inspected.png"));
    const importer = new DirectorySync({
      entityService: owner,
      logger: createSilentLogger(),
      syncPath: importRoot,
      autoSync: false,
      deleteOnFileRemoval: false,
    });
    const imported = await importer.importEntities(["image/inspected.png"]);
    assert.equal(imported.failed, 0);
    assert.equal(imported.imported, 1);
    const inspected = await owner.getEntity({
      entityType: "image",
      id: "inspected",
    });
    assert.ok(inspected);
    assert.equal(inspected.content, record.ref);
    assert.equal(inspected.metadata["width"], 1);
    assert.equal(inspected.metadata["height"], 1);
    await writeFile(
      join(importRoot, "image", "inspected.png"),
      Buffer.alloc(SIZE, 0x5a),
    );
    const bufferedRead = spyOn(owner, "readAsset").mockImplementation(
      async (): Promise<never> => {
        throw new Error("Controller asset buffering is forbidden");
      },
    );
    try {
      const exported = await importer.exportEntities(["image"]);
      assert.equal(exported.failed, 0);
      assert.ok(exported.exported > 0);
      assert.equal((await importer.exportEntities(["image"])).failed, 0);
      await binding.withFile(
        join(importRoot, "image", "inspected.png"),
        SIZE,
        SHA,
        async (publication) => {
          assert.deepEqual(publication.record, record);
        },
      );
    } finally {
      bufferedRead.mockRestore();
    }
    binding.assertTransferIdle();
    const repeatedImport = await importer.importEntities([
      "image/inspected.png",
    ]);
    assert.equal(repeatedImport.skipped, 1);
    assert.equal(repeatedImport.failed, 0);
    await copyFile(sourceFile, join(importRoot, "image", "mislabeled.jpg"));
    const rejectedImport = await importer.importEntities([
      "image/mislabeled.jpg",
    ]);
    assert.equal(rejectedImport.failed, 1);
    assert.equal(
      await owner.getEntity({ entityType: "image", id: "mislabeled" }),
      null,
    );
    binding.assertTransferIdle();
    // Add transaction fixtures after directory export: exporting those unrelated
    // entities twice adds no directory-caller coverage, only extra file actors.
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
    const uploadStore = app
      .getShell()
      .getRuntimeUploadRegistry()
      .scoped(webChatUploadsScope);
    const uploaded = await uploadStore.save({
      filename: "promoted.png",
      mediaType: "image/png",
      content: bytes,
    });
    await owner.createEntity({
      entity: {
        ...imageAdapter.createPendingImageEntity({
          title: "Pending upload",
          sourceUploadId: uploaded.id,
        }),
        id: "promoted-upload",
        visibility: "shared",
      },
    });
    assert.equal(
      (
        await owner.getEntityRaw({
          entityType: "image",
          id: "promoted-upload",
          visibilityScope: "restricted",
        })
      )?.content,
      "",
    );
    const pendingUpload = await owner.getEntity({
      entityType: "image",
      id: "promoted-upload",
      visibilityScope: "restricted",
    });
    assert.ok(pendingUpload);
    // Web mode registers validators, not executable handlers. This worker App
    // uniquely checks handler registration and file-capability provisioning over
    // the existing owner's authenticated RPC; it opens no additional databases.
    const workerApp = createApp();
    await workerApp.initialize(
      { mode: "register-only" },
      {
        migrationsCompleted: true,
        processRole: "worker",
        localDatabaseEndpoint: { ...endpoint, sessionId: "promotion-worker" },
        fileActors,
      },
    );
    try {
      const promotion = workerApp
        .getShell()
        .getJobQueueService()
        .getHandler("image:upload-promote");
      assert.ok(promotion);
      const reporter = CallbackProgressReporter.from(
        async (): Promise<void> => undefined,
      );
      assert.ok(reporter);
      const conversion = workerApp
        .getShell()
        .getJobQueueService()
        .getHandler("directory-sync:cover-image-convert");
      assert.ok(conversion);
      const page = join(directory, "remote-cover.md");
      await writeFile(page, "---\ntitle: Remote cover\n---\nBody\n");
      const server = Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch: (): Response =>
          new Response(Bun.file(sourceFile), {
            headers: { "content-type": "image/png" },
          }),
      });
      const bufferedFetch = spyOn(globalThis, "fetch").mockRejectedValue(
        new Error("Controller URL fetch is forbidden"),
      );
      try {
        const result = await conversion.process(
          {
            filePath: page,
            sourceUrl: `http://127.0.0.1:${server.port}/image`,
            postTitle: "Remote cover",
            postSlug: "remote",
          },
          "canonical-url-image",
          reporter,
          new AbortController().signal,
        );
        assert.deepEqual(result, { success: true, imageId: "remote-cover" });
        assert.equal(
          (await owner.getEntity({ entityType: "image", id: "remote-cover" }))
            ?.content,
          record.ref,
        );
      } finally {
        bufferedFetch.mockRestore();
        await server.stop(true);
      }
      const bufferedUpload = spyOn(
        RuntimeUploadStore.prototype,
        "read",
      ).mockImplementation(async (): Promise<never> => {
        throw new Error("Controller upload buffering is forbidden");
      });
      try {
        const result = await promotion.process(
          { uploadId: uploaded.id, imageId: "promoted-upload" },
          "canonical-upload-promotion",
          reporter,
          new AbortController().signal,
        );
        assert.deepEqual(result, {
          entityId: "promoted-upload",
          status: "created",
        });
        const promoted = await owner.getEntity({
          entityType: "image",
          id: "promoted-upload",
          visibilityScope: "restricted",
        });
        assert.ok(promoted);
        assert.equal(promoted.content, record.ref);
        assert.equal(promoted.visibility, "shared");
        assert.equal(promoted.created, pendingUpload.created);
      } finally {
        bufferedUpload.mockRestore();
      }
    } finally {
      await workerApp.stop();
    }
    binding.assertTransferIdle();
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
    await exerciseCanonicalReadRpc(
      binding,
      endpoint,
      record,
      join(directory, "download.png"),
    );
    binding.assertTransferIdle();
    assert.deepEqual(await owner.statAsset(record.ref), {
      ref: record.ref,
      sizeBytes: SIZE,
    });
    console.error(
      "[canonical-publication] native rollback, publication, deduplication and full consumer digest passed; local image import exercised; full caller/runtime factory cutover not exercised",
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
    for (const id of [
      "canonical-image",
      "deduplicated-image",
      "rpc-image",
      "inspected",
      "promoted-upload",
      "remote-cover",
    ]) {
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
    await exerciseCanonicalReadRpc(
      binding,
      endpoint,
      record,
      join(directory, "reopened.png"),
    );
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
