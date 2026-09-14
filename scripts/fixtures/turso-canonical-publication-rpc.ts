// Client exercise only: the App's source service factory owns endpoint routing.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ENTITY_BINARY_CONTROL_SERVICE,
  ENTITY_PUBLICATION_SERVICE,
  type BaseEntity,
  type CreateEntityRequest,
} from "@brains/entity-service";
import type { LocalDatabaseEndpointConfig } from "@brains/core";
import { LocalDatabaseRpcClient } from "../../shell/core/src/local-database-endpoint";
import {
  binaryUploadOfferSchema,
  binaryUploadReceiptSchema,
  binaryUploadEndpointSchema,
} from "@brains/db/binary-publication";
import { NetworkProcessOwner } from "../../shared/db/src/turso-worker/network-process-owner";
import type { CanonicalAssetBindings } from "./turso-canonical-asset-bindings";

export async function exerciseCanonicalPublicationRpc(
  binding: CanonicalAssetBindings,
  config: LocalDatabaseEndpointConfig,
  sourceFile: string,
  size: number,
  digest: string,
  entity: CreateEntityRequest<BaseEntity>["entity"],
): Promise<void> {
  const client = new LocalDatabaseRpcClient({
    config: { ...config, sessionId: "worker" },
  });
  const foreign = new LocalDatabaseRpcClient({
    config: { ...config, sessionId: "worker" },
  });
  const unauthenticated = new LocalDatabaseRpcClient({
    config: { ...config, secret: randomUUID(), sessionId: "worker" },
  });
  const processes = new NetworkProcessOwner(
    process.execPath,
    new URL(
      "../../shared/db/src/turso-worker/file-upload-process.ts",
      import.meta.url,
    ),
    "upload",
  );
  const pending: Promise<unknown>[] = [];
  const errors: unknown[] = [];
  try {
    await assert.rejects(
      unauthenticated.request(ENTITY_BINARY_CONTROL_SERVICE, {
        operation: "offer",
        size,
      }),
    );
    assert.deepEqual(binding.binary.stats(), { admissions: 0, tickets: 0 });
    const cancelled = binaryUploadOfferSchema.parse(
      await client.request(ENTITY_BINARY_CONTROL_SERVICE, {
        operation: "offer",
        size: 32768,
      }),
    );
    await assert.rejects(
      foreign.request(ENTITY_BINARY_CONTROL_SERVICE, {
        operation: "cancel",
        ticket: cancelled.ticket,
      }),
    );
    assert.equal(
      await client.request(ENTITY_BINARY_CONTROL_SERVICE, {
        operation: "cancel",
        ticket: cancelled.ticket,
      }),
      null,
    );
    assert.deepEqual(binding.binary.stats(), { admissions: 0, tickets: 0 });
    binding.assertTransferIdle();
    const offer = binaryUploadOfferSchema.parse(
      await client.request(ENTITY_BINARY_CONTROL_SERVICE, {
        operation: "offer",
        size,
      }),
    );
    const upload = client.request(ENTITY_BINARY_CONTROL_SERVICE, {
      operation: "upload",
      ticket: offer.ticket,
    });
    pending.push(upload);
    void upload.catch(() => undefined); // Observed below and again during acknowledged teardown.
    const endpoint = binaryUploadEndpointSchema.parse(
      await client.request(ENTITY_BINARY_CONTROL_SERVICE, {
        operation: "endpoint",
        ticket: offer.ticket,
      }),
    );
    const producer = processes.spawn();
    assert.notEqual(producer.pid, process.pid);
    producer.start({ direction: "upload", endpoint, size, sourceFile });
    const transferFailed = upload.then<never>(() => {
      throw new Error("Upload completed before producer credit was resumed");
    });
    void transferFailed.catch(() => undefined); // Observed by held-credit rendezvous, not per chunk.
    pending.push(producer.result, producer.exited);
    await Promise.race([producer.held, transferFailed]);
    producer.resume();
    const [wireReceipt, produced, exitCode] = await Promise.all([
      upload,
      producer.result,
      producer.exited,
    ]);
    const receipt = binaryUploadReceiptSchema.parse(wireReceipt);
    assert.deepEqual(produced, { sizeBytes: size, sha256: digest });
    assert.equal(exitCode, 0);
    assert.equal(receipt.sha256, digest);
    assert.equal(receipt.sizeBytes, size);
    const request = {
      operation: "createEntity",
      assetUploadId: receipt.ticket,
      request: { entity },
    };
    await assert.rejects(foreign.request(ENTITY_PUBLICATION_SERVICE, request));
    await assert.rejects(
      client.request(ENTITY_PUBLICATION_SERVICE, {
        operation: "readAssetChunk",
        ref: entity.content,
        offset: 0,
        length: 1,
      }),
      { name: "ZodError" },
    );
    await assert.rejects(
      client.request(ENTITY_PUBLICATION_SERVICE, {
        ...request,
        request: {
          entity,
          preparedAsset: {
            ref: entity.content,
            digest,
            sizeBytes: 0,
            bytes: new Uint8Array(),
          },
        },
      }),
      /preparedAsset/,
    );
    await client.request(ENTITY_PUBLICATION_SERVICE, request);
    await assert.rejects(client.request(ENTITY_PUBLICATION_SERVICE, request));
    assert.deepEqual(binding.binary.stats(), { admissions: 0, tickets: 0 });
    binding.assertTransferIdle();
    console.error(
      "[canonical-publication-rpc] App-owned authenticated file offer/upload/publication passed; wrong secret, foreign socket, buffered handoff and replay rejected",
    );
  } catch (error) {
    errors.push(error);
  }
  client.close();
  foreign.close();
  unauthenticated.close();
  const settled = await Promise.allSettled([processes.close(), ...pending]);
  for (const result of settled)
    if (result.status === "rejected") errors.push(result.reason);
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(
      errors,
      "Canonical publication RPC and producer cleanup failed",
      { cause: errors[0] },
    );
  assert.equal(processes.stats().children, 0);
}
