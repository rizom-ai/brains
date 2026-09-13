// Opt-in storage/RPC protocol rehearsal, not a canonical brain app or document cutover.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MAX_ASSET_BYTES,
  prepareAsset,
  computeAssetDigest,
} from "@brains/assets";
import { createSilentLogger } from "@brains/test-utils";
import { createMockJobQueueService } from "@brains/job-queue/test";
import { createTestEntity } from "@brains/entity-service/test";
import {
  EntityRegistry,
  RemoteEntityService,
  createEntityRpcHandler,
  parseEntityRpcCall,
  parseEntityRpcRequest,
  type EntityRpcTransport,
  type ProjectionStoreRpcTransport,
} from "@brains/entity-service";
import {
  LocalDatabaseRpcServer,
  LocalDatabaseRpcClient,
} from "../../../shell/core/src/local-database-endpoint";
import { ASSET_RPC_CHUNK_BYTES } from "../../../shell/entity-service/src/asset-transfers";
import { setupEntityService } from "../../../shell/entity-service/test/helpers/setup-entity-service";
import {
  minimalTestSchema,
  minimalTestAdapter,
} from "../../../shell/entity-service/test/helpers/test-schemas";
import { mockEmbeddingService } from "../../../shell/entity-service/test/helpers/mock-services";

const directory = await mkdtemp(join(tmpdir(), "brains-asset-rpc-"));
const config = {
  address: join(directory, "owner.sock"),
  secret: randomUUID() + randomUUID(),
  sessionId: "asset-worker",
};
const typeConfig = {
  binaryStorage: "asset",
  embeddable: false,
  fullTextSearchable: false,
} as const;
const owner = await setupEntityService([
  {
    name: "test",
    schema: minimalTestSchema,
    adapter: minimalTestAdapter,
    config: typeConfig,
  },
]);
const server = new LocalDatabaseRpcServer({ config });
const client = new LocalDatabaseRpcClient({ config });
const other = new LocalDatabaseRpcClient({ config }); // Same claimed session ID, different socket.
const handler = createEntityRpcHandler(owner.entityService);
let largestChunk = 0;
let uploadedChunks = 0;
let readChunks = 0;
const disconnected = Promise.withResolvers<void>();
let watchedUpload: string | undefined;
server.register("entity", (payload, context) => {
  const call = parseEntityRpcCall(payload);
  const request = parseEntityRpcRequest(call.request);
  if (request.operation === "appendAssetUpload") {
    largestChunk = Math.max(largestChunk, request.bytes.byteLength);
    uploadedChunks++;
  }
  if (request.operation === "readAssetChunk") readChunks++;
  if (
    request.operation === "beginAssetUpload" &&
    request.uploadId === watchedUpload
  ) {
    context.connectionSignal.addEventListener(
      "abort",
      () => disconnected.resolve(),
      { once: true },
    );
  }
  return handler(call.request, context.signal, context.connectionSignal);
});
const transport: EntityRpcTransport = {
  initialize: () => client.initialize(),
  request: (payload, options) => client.request("entity", payload, options),
  close: (): void => {}, // Borrowed client; the rehearsal closes it in finally.
};
const projectionTransport: ProjectionStoreRpcTransport = {
  initialize: () => client.initialize(),
  request: async (): Promise<never> => {
    throw new Error("Unexpected projection RPC in asset fixture");
  },
  close: (): void => {},
};
const registry = EntityRegistry.createFresh(createSilentLogger());
registry.registerEntityType(
  "test",
  minimalTestSchema,
  minimalTestAdapter,
  typeConfig,
);
const remote = new RemoteEntityService({
  transport,
  projectionTransport,
  entityRegistry: registry,
  embeddingService: mockEmbeddingService,
  jobQueueService: createMockJobQueueService(),
  logger: createSilentLogger(),
});
const sizes = [
  ASSET_RPC_CHUNK_BYTES + 7,
  17 * 1024 * 1024 + 7,
  MAX_ASSET_BYTES,
];
const results: Array<{ bytes: number; milliseconds: number }> = [];
try {
  await server.initialize();
  await remote.initialize();
  for (const size of sizes) {
    const started = performance.now();
    const asset = prepareAsset(new Uint8Array(size).fill(0xa5));
    await remote.createEntity({
      entity: createTestEntity("test", {
        id: `size-${size}`,
        content: asset.ref,
      }),
      preparedAsset: asset,
    });
    assert.equal(
      computeAssetDigest(await remote.readAsset(asset.ref)),
      asset.digest,
    );
    assert.deepEqual(await remote.statAsset(asset.ref), {
      ref: asset.ref,
      sizeBytes: size,
    });
    assert.equal((await remote.verifyAsset(asset.ref)).valid, true);
    assert.equal(
      (
        await owner.entityService.getEntityRaw({
          entityType: "test",
          id: `size-${size}`,
        })
      )?.content,
      asset.ref,
    );
    results.push({
      bytes: size,
      milliseconds: Math.round(performance.now() - started),
    });
  }
  assert.equal(largestChunk, ASSET_RPC_CHUNK_BYTES);
  assert.ok(uploadedChunks > sizes.length && readChunks > sizes.length);

  const unpublished = prepareAsset(new Uint8Array([0, 17, 255]));
  const record = {
    ref: unpublished.ref,
    digest: unpublished.digest,
    sizeBytes: MAX_ASSET_BYTES,
  };
  watchedUpload = randomUUID();
  await client.request("entity", {
    operation: "beginAssetUpload",
    uploadId: watchedUpload,
    asset: record,
  });
  await client.request("entity", {
    operation: "appendAssetUpload",
    uploadId: watchedUpload,
    offset: 0,
    bytes: unpublished.bytes,
  });
  await assert.rejects(
    other.request("entity", {
      operation: "discardAssetUpload",
      uploadId: watchedUpload,
    }),
    /Unknown asset upload/,
  );
  // All owner staging capacity is held until this socket closes.
  await assert.rejects(
    other.request("entity", {
      operation: "beginAssetUpload",
      uploadId: randomUUID(),
      asset: record,
    }),
    /capacity/,
  );
  client.close();
  await disconnected.promise;
  const retry = randomUUID();
  await other.request("entity", {
    operation: "beginAssetUpload",
    uploadId: retry,
    asset: record,
  });
  await other.request("entity", {
    operation: "discardAssetUpload",
    uploadId: retry,
  });
  assert.equal(await owner.entityService.statAsset(unpublished.ref), null);

  console.log(
    JSON.stringify({
      scope: "local-turso-asset-rpc",
      results,
      largestChunk,
      uploadedChunks,
      readChunks,
      disconnectCleanup: true,
      crossConnectionIsolation: true,
      partialUploadPublished: false,
      canonicalBrainBoot: false,
      documentCutover: false,
    }),
  );
} finally {
  remote.close();
  client.close();
  other.close();
  await server.close();
  await owner.cleanup();
  await rm(directory, { recursive: true, force: true });
}
