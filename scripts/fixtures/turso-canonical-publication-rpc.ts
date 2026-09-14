// Client exercise only: source clients and the App own protocol routing/validation.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  EntityBinaryClient,
  ENTITY_BINARY_CONTROL_SERVICE,
  ENTITY_PUBLICATION_SERVICE,
  type BaseEntity,
  type CreateEntityRequest,
} from "@brains/entity-service";
import type { LocalDatabaseEndpointConfig } from "@brains/core";
import { LocalDatabaseRpcClient } from "../../shell/core/src/local-database-endpoint";
import { NetworkProcessOwner } from "../../shared/db/src/turso-worker/network-process-owner";
import { FileProcessOwner } from "@brains/db/file-process-owner";

function fileProcesses(): FileProcessOwner {
  return new FileProcessOwner({
    executable: process.execPath,
    uploadUrl: new URL(
      "../../shared/db/src/turso-worker/file-upload-process.ts",
      import.meta.url,
    ),
    downloadUrl: new URL(
      "../../shared/db/src/turso-worker/file-download-process.ts",
      import.meta.url,
    ),
  });
}
import type { CanonicalAssetBindings } from "./turso-canonical-asset-bindings";
import type { AssetRecord } from "@brains/assets";

function binaryClient(client: LocalDatabaseRpcClient): EntityBinaryClient {
  return new EntityBinaryClient({
    transport: {
      invalidate: (): void => client.close(),
      control: (input, options) =>
        client.request(ENTITY_BINARY_CONTROL_SERVICE, input, options),
      publication: (input, options) =>
        client.request(ENTITY_PUBLICATION_SERVICE, input, options),
    },
  });
}
export async function exerciseCanonicalReadRpc(
  binding: CanonicalAssetBindings,
  config: LocalDatabaseEndpointConfig,
  record: AssetRecord,
  outputFile: string,
): Promise<void> {
  const client = new LocalDatabaseRpcClient({
    config: { ...config, sessionId: "worker" },
  });
  const foreign = new LocalDatabaseRpcClient({
    config: { ...config, sessionId: "worker" },
  });
  const assets = binaryClient(client);
  const foreignAssets = binaryClient(foreign);
  const files = fileProcesses();
  const processes = new NetworkProcessOwner(
    process.execPath,
    new URL(
      "../../shared/db/src/turso-worker/file-download-process.ts",
      import.meta.url,
    ),
    "read",
  );
  const pending: Promise<unknown>[] = [];
  const errors: unknown[] = [];
  try {
    // Deliberately bypass the client only for malformed-wire checks.
    await assert.rejects(
      client.request(ENTITY_BINARY_CONTROL_SERVICE, {
        operation: "offerRead",
        ref: record.ref,
        plan: { table: "arbitrary" },
      }),
    );
    await binding.withCorruptRead(async (ref) => {
      await assert.rejects(assets.offerRead(ref), /expected digest/);
      assert.deepEqual(binding.binary.reads.stats(), {
        admissions: 0,
        tickets: 0,
      });
      binding.assertTransferIdle();
    });
    const idle = await assets.offerRead(record.ref);
    await assert.rejects(foreignAssets.cancelRead(idle.ticket));
    await assets.cancelRead(idle.ticket);
    const offer = await assets.offerRead(record.ref);
    const facts = { sizeBytes: record.sizeBytes, sha256: record.digest };
    assert.deepEqual(
      { sizeBytes: offer.sizeBytes, sha256: offer.sha256 },
      facts,
    );
    const download = assets.download(offer.ticket);
    pending.push(download);
    void download.catch(() => undefined); // Observed below and during acknowledged teardown.
    await assert.rejects(foreignAssets.readEndpoint(offer.ticket));
    const endpoint = await assets.readEndpoint(offer.ticket);
    await assert.rejects(assets.readEndpoint(offer.ticket));
    await assert.rejects(assets.download(offer.ticket));
    const consumer = files.download({ endpoint, facts, outputFile });
    pending.push(consumer);
    const [received, delivered] = await Promise.all([consumer, download]);
    assert.deepEqual(received, facts);
    assert.deepEqual(delivered, facts);
    assert.equal(files.stats().children, 0); // Completion includes actual actor exit.
    // Independently read every output byte in the source producer, not this controller.
    await binding.withFile(
      outputFile,
      record.sizeBytes,
      record.digest,
      async (publication) => {
        assert.deepEqual(publication.record, record);
      },
    );
    binding.assertTransferIdle();

    const cancelled = await assets.offerRead(record.ref);
    const retired = Promise.withResolvers<{
      error: unknown;
      connectionAborted: boolean;
    }>();
    const original = binding.binary.reads.download;
    binding.binary.reads.download = async (
      context,
      ticket,
    ): ReturnType<typeof original> => {
      if (ticket !== cancelled.ticket)
        return original.call(binding.binary.reads, context, ticket);
      let failure: unknown;
      try {
        return await original.call(binding.binary.reads, context, ticket);
      } catch (error) {
        failure = error;
        throw error;
      } finally {
        retired.resolve({
          error: failure,
          connectionAborted: context.connectionSignal.aborted,
        });
      }
    };
    try {
      const cancelledRead = assets.download(cancelled.ticket);
      pending.push(cancelledRead.catch(() => undefined)); // Explicitly asserted as cancellation below.
      const address = await assets.readEndpoint(cancelled.ticket);
      const heldConsumer = processes.spawn();
      pending.push(
        heldConsumer.result.catch(() => undefined),
        heldConsumer.exited,
      );
      heldConsumer.start({
        direction: "read",
        endpoint: address,
        facts,
        outputFile: `${outputFile}.cancelled`,
      });
      await Promise.race([
        heldConsumer.held,
        cancelledRead.then(() => {
          throw new Error("Read completed before disconnect");
        }),
      ]);
      client.close();
      await assert.rejects(cancelledRead);
      const observed = await retired.promise; // Real source-method settlement, not a cleanup request.
      assert.equal(observed.connectionAborted, true);
      assert.ok(observed.error instanceof Error);
      binding.assertTransferIdle();
      const reusable = await foreignAssets.offerRead(record.ref);
      await foreignAssets.cancelRead(reusable.ticket);
      assert.notEqual(await heldConsumer.exited, 0); // Source consumer exits after peer loss, even while paused.
      assert.equal(await Bun.file(`${outputFile}.cancelled`).exists(), false);
      await assert.rejects(heldConsumer.result);
    } finally {
      binding.binary.reads.download = original;
    }
  } catch (error) {
    errors.push(error);
  }
  client.close();
  foreign.close();
  for (const result of await Promise.allSettled([
    processes.close(),
    files.close(),
    ...pending,
  ]))
    if (result.status === "rejected" && !errors.includes(result.reason))
      errors.push(result.reason);
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, "Canonical read and peer cleanup failed", {
      cause: errors[0],
    });
  assert.equal(processes.stats().children, 0);
}

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
  const assets = binaryClient(client);
  const foreignAssets = binaryClient(foreign);
  const processes = fileProcesses();
  const pending: Promise<unknown>[] = [];
  const errors: unknown[] = [];
  try {
    await assert.rejects(binaryClient(unauthenticated).offer(size));
    assert.deepEqual(binding.binary.stats(), { admissions: 0, tickets: 0 });
    const cancelled = await assets.offer(32768);
    await assert.rejects(foreignAssets.cancel(cancelled.ticket));
    await assets.cancel(cancelled.ticket);
    assert.deepEqual(binding.binary.stats(), { admissions: 0, tickets: 0 });
    binding.assertTransferIdle();
    const offer = await assets.offer(size);
    const upload = assets.upload(offer.ticket);
    pending.push(upload);
    void upload.catch(() => undefined); // Observed below and again during acknowledged teardown.
    const endpoint = await assets.endpoint(offer.ticket);
    const producer = processes.upload({ endpoint, size, sourceFile });
    pending.push(producer);
    const [receipt, produced] = await Promise.all([upload, producer]);
    assert.deepEqual(produced, { sizeBytes: size, sha256: digest });
    assert.equal(processes.stats().children, 0);
    assert.equal(receipt.sha256, digest);
    assert.equal(receipt.sizeBytes, size);
    const request = {
      operation: "createEntity" as const,
      assetUploadId: receipt.ticket,
      request: { entity },
    };
    await assert.rejects(foreignAssets.publish(request));
    await assert.rejects(
      client.request(ENTITY_PUBLICATION_SERVICE, {
        request: {
          operation: "readAssetChunk",
          ref: entity.content,
          offset: 0,
          length: 1,
        },
      }),
      { name: "ZodError" },
    );
    await assert.rejects(
      client.request(ENTITY_PUBLICATION_SERVICE, {
        request: {
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
        },
      }),
      /preparedAsset/,
    );
    const published = await assets.publish(request);
    assert.equal(published.entityId, entity.id);
    await assert.rejects(assets.publish(request));
    assert.deepEqual(binding.binary.stats(), { admissions: 0, tickets: 0 });
    binding.assertTransferIdle();
    console.error(
      "[canonical-publication-rpc] source client and App-owned file publication passed; foreign sockets, buffered handoff and replay rejected",
    );
  } catch (error) {
    errors.push(error);
  }
  client.close();
  foreign.close();
  unauthenticated.close();
  for (const result of await Promise.allSettled([
    processes.close(),
    ...pending,
  ]))
    if (result.status === "rejected" && !errors.includes(result.reason))
      errors.push(result.reason);
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(
      errors,
      "Canonical publication RPC and producer cleanup failed",
      { cause: errors[0] },
    );
  assert.equal(processes.stats().children, 0);
}
