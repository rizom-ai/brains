// Standalone scale acceptance (not a canonical timing test):
// bun --preload ./scripts/fixtures/turso-canonical-candidate.ts ./scripts/fixtures/turso-production-large-file.ts
// Canonical AI/site/PDF tests retain their existing five-second deadline.
import { spyOn } from "bun:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { App, resolve, parseInstanceOverrides } from "@brains/app";
import { createAssetRef } from "@brains/assets";
import {
  EntityService,
  EntityBinaryClient,
  ENTITY_BINARY_CONTROL_SERVICE,
  ENTITY_PUBLICATION_SERVICE,
} from "@brains/entity-service";
import { LocalDatabaseRpcClient } from "../../shell/core/src/local-database-endpoint";
import { canonicalBrain } from "../../packages/brain-cli/src/model/canonical-brain";
import {
  canonicalAssetBindings,
  canonicalTestLifetime,
  retireCanonicalCandidate,
} from "./turso-canonical-candidate";

const SIZE = 100 * 1024 * 1024;
const actor = (name: string): URL =>
  new URL(`../../shared/db/src/turso-worker/${name}.ts`, import.meta.url);
function binaryClient(client: LocalDatabaseRpcClient): EntityBinaryClient {
  return new EntityBinaryClient({
    transport: {
      invalidate: (): void => client.close(),
      control: (input, options): Promise<unknown> =>
        client.request(ENTITY_BINARY_CONTROL_SERVICE, input, options),
      publication: (input, options): Promise<unknown> =>
        client.request(ENTITY_PUBLICATION_SERVICE, input, options),
    },
  });
}

async function exercise(): Promise<void> {
  const directory = await mkdtemp(
    join(tmpdir(), "turso-production-large-file-"),
  );
  console.error(`[production-large-file] retained fixture: ${directory}`);
  const url = pathToFileURL(join(directory, "entities.db")).href;
  const endpoint = {
    address: join(directory, "owner.sock"),
    secret: randomUUID() + randomUUID(),
    sessionId: "large-owner",
  };
  const config = resolve(
    canonicalBrain,
    { AI_API_KEY: "fixture-only" },
    parseInstanceOverrides(`brain: brain
bundleContract: capability-bundles-v1
anchor: person
kind: professional
bundles: [core, media]
plugins:
  directory-sync:
    autoSync: false
    initialSync: false
    seedContent: false
  topics:
    enableAutoExtraction: false
`),
  );
  const app = App.create({
    ...config,
    shellConfig: {
      ...config.shellConfig,
      database: { url },
      jobQueueDatabase: { url: pathToFileURL(join(directory, "jobs.db")).href },
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
  // Same declared session as the runtime, but a different authenticated connection.
  const foreign = new LocalDatabaseRpcClient({
    config: { ...endpoint, sessionId: "large-owner:files" },
  });
  const unauthenticated = new LocalDatabaseRpcClient({
    config: { ...endpoint, secret: randomUUID() },
  });
  const foreignAssets = binaryClient(foreign);
  const failures: unknown[] = [];
  try {
    await app.migrate();
    await app.initialize(
      { mode: "register-only" },
      {
        migrationsCompleted: true,
        processRole: "web",
        localDatabaseEndpoint: endpoint,
        fileActors: {
          executable: process.execPath,
          uploadUrl: actor("file-upload-process"),
          downloadUrl: actor("file-download-process"),
          inspectionUploadUrl: new URL(
            "../../shared/image/src/file-inspection-process.ts",
            import.meta.url,
          ),
          producerUrls: {
            "large-document-proof": new URL(
              "./turso-large-document-producer.ts",
              import.meta.url,
            ),
          },
        },
      },
    );
    assert.deepEqual(app.getShell().getPluginManager().getFailedPlugins(), []);
    console.error("[production-large-file] App initialized");
    const service = app.getShell().getEntityService();
    assert.ok(service instanceof EntityService);
    const files = service.fileAssets;
    assert.ok(files?.withProducedFile);
    const binding = canonicalAssetBindings(url);
    const blockedRead = spyOn(service, "readAsset").mockImplementation(
      async (): Promise<never> => {
        throw new Error("Controller binary read forbidden");
      },
    );
    const blockedChunk = spyOn(service, "readAssetChunk").mockImplementation(
      async (): Promise<never> => {
        throw new Error("Controller binary chunk read forbidden");
      },
    );
    const upload = binding.binary.upload.bind(binding.binary);
    let checkedOwner = false;
    let sourcePath = "";
    let downloadPath = "";
    try {
      await assert.rejects(binaryClient(unauthenticated).offer(SIZE));
      await assert.rejects(foreignAssets.offer(SIZE + 1));
      binding.assertTransferIdle();
      await files.withProducedFile(
        undefined,
        async (source, signal): Promise<void> => {
          console.error(
            "[production-large-file] native 100 MiB producer retired",
          );
          sourcePath = source.sourceFile;
          assert.equal(source.sizeBytes, SIZE);
          const ref = createAssetRef(source.sha256);
          const entity = {
            id: "large-document",
            entityType: "document",
            visibility: "public" as const,
            content: ref,
            metadata: {
              title: "100 MiB native PDF fixture",
              filename: "large.pdf",
              mimeType: "application/pdf",
              sizeBytes: SIZE,
              pageCount: 1,
              status: "draft",
            },
          };
          binding.binary.upload = async (
            context,
            ticket,
          ): ReturnType<typeof upload> => {
            console.error("[production-large-file] upload entered");
            const receipt = await upload(context, ticket);
            console.error("[production-large-file] upload sealed");
            if (!checkedOwner) {
              assert.equal(receipt.sizeBytes, SIZE);
              assert.equal(receipt.sha256, source.sha256);
              await assert.rejects(
                foreignAssets.publish({
                  operation: "createEntity",
                  assetUploadId: receipt.ticket,
                  request: { entity },
                }),
              );
              console.error(
                "[production-large-file] foreign publication rejected",
              );
              await assert.rejects(foreignAssets.cancel(receipt.ticket));
              console.error(
                "[production-large-file] foreign cancellation rejected",
              );
              checkedOwner = true;
            }
            return receipt;
          };
          assert.equal(
            await service.getEntity({ entityType: "document", id: entity.id }),
            null,
          );
          const result = await files.publish(
            {
              sourceFile: source.sourceFile,
              sizeBytes: SIZE,
              publication: { operation: "createEntity", request: { entity } },
            },
            { signal },
          );
          assert.equal(result.entityId, entity.id);
          assert.equal(checkedOwner, true);
          const stored = await service.getEntity({
            entityType: "document",
            id: entity.id,
          });
          assert.ok(stored);
          assert.equal(stored.content, ref);
          assert.equal(stored.metadata["sizeBytes"], SIZE);
          // Production authorized source control + native read consumer, not readAsset buffers.
          await files.withAssetFile(
            ref,
            async (download, readSignal): Promise<void> => {
              downloadPath = download.sourceFile;
              assert.equal(download.sizeBytes, SIZE);
              assert.equal(download.sha256, source.sha256);
              // Independent full-file fingerprint in the production inspection actor.
              assert.deepEqual(
                await files.fingerprint(
                  {
                    sourceFile: download.sourceFile,
                    sizeBytes: download.sizeBytes,
                  },
                  { signal: readSignal },
                ),
                { sizeBytes: SIZE, sha256: source.sha256 },
              );
            },
            { signal },
          );
          assert.equal(await Bun.file(downloadPath).exists(), false);
          console.error(
            `[production-large-file] ${SIZE} bytes published to document entity and fully read back; SHA-256 ${source.sha256}; foreign live claim rejected`,
          );
        },
        { producer: "large-document-proof" },
      );
      assert.equal(await Bun.file(sourcePath).exists(), false);
      assert.equal(blockedRead.mock.calls.length, 0);
      assert.equal(blockedChunk.mock.calls.length, 0);
      binding.assertTransferIdle();
    } finally {
      binding.binary.upload = upload;
      blockedRead.mockRestore();
      blockedChunk.mockRestore();
    }
  } catch (error) {
    failures.push(error);
  }
  foreign.close();
  unauthenticated.close();
  try {
    await app.stop();
  } catch (error) {
    failures.push(error);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(
      failures,
      "Large-file proof and App retirement failed",
      { cause: failures[0] },
    );
}
const started = performance.now();
try {
  await canonicalTestLifetime.run(exercise);
} finally {
  await retireCanonicalCandidate();
}
console.error(
  `[production-large-file] passed with joined retirement in ${((performance.now() - started) / 1000).toFixed(2)}s; not canonical timing, installed or RSS acceptance`,
);
