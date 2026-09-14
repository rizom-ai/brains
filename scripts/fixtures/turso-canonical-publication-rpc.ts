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
import type { AssetRecord } from "@brains/assets";
import {
  binaryReadOfferSchema as readOfferSchema,
  binaryReadEndpointSchema as readEndpointSchema,
} from "@brains/db/binary-read";

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
    await assert.rejects(
      client.request(ENTITY_BINARY_CONTROL_SERVICE, {
        operation: "offerRead",
        ref: record.ref,
        plan: { table: "arbitrary" },
      }),
    );
    await binding.withCorruptRead(async (ref) => {
      await assert.rejects(
        client.request(ENTITY_BINARY_CONTROL_SERVICE, {
          operation: "offerRead",
          ref,
        }),
        /expected digest/,
      );
      assert.deepEqual(binding.binary.reads.stats(), {
        admissions: 0,
        tickets: 0,
      });
      binding.assertTransferIdle();
    });
    const idle = readOfferSchema.parse(
      await client.request(ENTITY_BINARY_CONTROL_SERVICE, {
        operation: "offerRead",
        ref: record.ref,
      }),
    );
    await assert.rejects(
      foreign.request(ENTITY_BINARY_CONTROL_SERVICE, {
        operation: "cancelRead",
        ticket: idle.ticket,
      }),
    );
    assert.equal(
      await client.request(ENTITY_BINARY_CONTROL_SERVICE, {
        operation: "cancelRead",
        ticket: idle.ticket,
      }),
      null,
    );
    const offer = readOfferSchema.parse(
      await client.request(ENTITY_BINARY_CONTROL_SERVICE, {
        operation: "offerRead",
        ref: record.ref,
      }),
    );
    const facts = { sizeBytes: record.sizeBytes, sha256: record.digest };
    assert.deepEqual(
      { sizeBytes: offer.sizeBytes, sha256: offer.sha256 },
      facts,
    );
    const download = client.request(ENTITY_BINARY_CONTROL_SERVICE, {
      operation: "download",
      ticket: offer.ticket,
    });
    pending.push(download);
    void download.catch(() => undefined); // Observed below and during acknowledged teardown.
    await assert.rejects(
      foreign.request(ENTITY_BINARY_CONTROL_SERVICE, {
        operation: "readEndpoint",
        ticket: offer.ticket,
      }),
    );
    const endpoint = readEndpointSchema.parse(
      await client.request(ENTITY_BINARY_CONTROL_SERVICE, {
        operation: "readEndpoint",
        ticket: offer.ticket,
      }),
    );
    await assert.rejects(
      client.request(ENTITY_BINARY_CONTROL_SERVICE, {
        operation: "readEndpoint",
        ticket: offer.ticket,
      }),
    );
    await assert.rejects(
      client.request(ENTITY_BINARY_CONTROL_SERVICE, {
        operation: "download",
        ticket: offer.ticket,
      }),
    );
    const consumer = processes.spawn();
    pending.push(consumer.result, consumer.exited);
    const failed = download.then<never>(() => {
      throw new Error("Read completed before consumer resume");
    });
    void failed.catch(() => undefined); // One startup rendezvous, never a per-chunk observer.
    consumer.start({ direction: "read", endpoint, facts, outputFile });
    await Promise.race([consumer.held, failed]);
    consumer.resume();
    const [received, delivered, code] = await Promise.all([
      consumer.result,
      download,
      consumer.exited,
    ]);
    assert.deepEqual(received, facts);
    assert.deepEqual(delivered, facts);
    assert.equal(code, 0);
    // Independently read every output byte in the source file producer, not this controller.
    await binding.withFile(
      outputFile,
      record.sizeBytes,
      record.digest,
      async (publication) => {
        assert.deepEqual(publication.record, record);
      },
    );
    binding.assertTransferIdle();

    const cancelled = readOfferSchema.parse(
      await client.request(ENTITY_BINARY_CONTROL_SERVICE, {
        operation: "offerRead",
        ref: record.ref,
      }),
    );
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
      const cancelledRead = client.request(ENTITY_BINARY_CONTROL_SERVICE, {
        operation: "download",
        ticket: cancelled.ticket,
      });
      pending.push(cancelledRead.catch(() => undefined)); // Explicitly asserted as cancellation below.
      const address = readEndpointSchema.parse(
        await client.request(ENTITY_BINARY_CONTROL_SERVICE, {
          operation: "readEndpoint",
          ticket: cancelled.ticket,
        }),
      );
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
      const observed = await retired.promise; // Observation of the real source method, not a cleanup request.
      assert.equal(observed.connectionAborted, true);
      assert.ok(observed.error instanceof Error);
      binding.assertTransferIdle();
      const reusable = readOfferSchema.parse(
        await foreign.request(ENTITY_BINARY_CONTROL_SERVICE, {
          operation: "offerRead",
          ref: record.ref,
        }),
      );
      assert.equal(
        await foreign.request(ENTITY_BINARY_CONTROL_SERVICE, {
          operation: "cancelRead",
          ticket: reusable.ticket,
        }),
        null,
      );
      assert.notEqual(await heldConsumer.exited, 0); // Source consumer closes and exits after peer loss, even while paused.
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
