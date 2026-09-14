import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createAssetRef } from "@brains/assets";
import { EntityBinaryClient } from "../src/entity-binary-client";

const ticket = "00000000-0000-4000-8000-000000000001";
const ref = createAssetRef("a".repeat(64));

test("binary client validates metadata before transport without reading prepared bytes", async () => {
  let calls = 0;
  let touched = false;
  const client = new EntityBinaryClient({
    transport: {
      invalidate: (): void => {
        throw new Error("Unexpected invalidation");
      },
      control: async (): Promise<unknown> => {
        calls++;
        return null;
      },
      publication: async (): Promise<unknown> => {
        calls++;
        return null;
      },
    },
  });
  const preparedAsset = {
    get bytes(): Uint8Array {
      touched = true;
      throw new Error("must not inspect");
    },
  };
  const malformed = {
    operation: "createEntity" as const,
    assetUploadId: ticket,
    request: {
      entity: { id: "image", entityType: "image", content: ref, metadata: {} },
      preparedAsset,
    },
  };
  await assert.rejects(client.publish(malformed));
  await assert.rejects(client.offer(100 * 1024 * 1024 + 1));
  expect(calls).toBe(0);
  expect(touched).toBe(false);
});

test("binary client preserves request cancellation and validates responses", async () => {
  const cancellation = new AbortController();
  let observed: AbortSignal | undefined;
  let invalidated = false;
  const expected = { ticket, sizeBytes: 1, sha256: "a".repeat(64) };
  let reply: unknown = expected;
  const client = new EntityBinaryClient({
    transport: {
      invalidate: (): void => {
        invalidated = true;
      },
      control: async (request, options): Promise<unknown> => {
        expect(request).toEqual({ operation: "offerRead", ref });
        observed = options?.signal;
        return reply;
      },
      publication: async (): Promise<never> => {
        throw new Error("unexpected publication");
      },
    },
  });
  expect(await client.offerRead(ref, { signal: cancellation.signal })).toEqual(
    expected,
  );
  expect(observed).toBe(cancellation.signal);
  reply = { ticket, bytes: new Uint8Array(1) };
  await assert.rejects(client.offerRead(ref));
  expect(invalidated).toBe(true);
  await assert.rejects(client.offerRead(ref), /fenced/);
  cancellation.abort();
  await assert.rejects(client.offerRead(ref, { signal: cancellation.signal }));
});

test("reply validation retains a failed connection-fencing cause", async () => {
  const cleanup = new Error("connection fencing failed");
  let failure: unknown;
  const client = new EntityBinaryClient({
    transport: {
      invalidate: (): never => {
        throw cleanup;
      },
      control: async (): Promise<unknown> => ({ ticket: "invalid" }),
      publication: async (): Promise<never> => {
        throw new Error("Unexpected publication");
      },
    },
  });
  await assert.rejects(client.offer(1), (error: unknown) => {
    if (!(error instanceof AggregateError)) return false;
    expect(error.errors.length).toBe(2);
    expect(error.errors[1]).toBe(cleanup);
    expect(error.errors[0]).toBeInstanceOf(Error);
    failure = error;
    return true;
  });
  await assert.rejects(
    client.offer(1),
    (error: unknown) => error instanceof Error && error.cause === failure,
  );
});

test("binary publication preserves the active batch fence in its envelope", async () => {
  const batchScope = {
    batchId: "batch",
    source: "directory-sync",
    operationId: "operation",
    ownerToken: "owner-token",
  };
  const signal = new AbortController().signal;
  const result = { entityId: "image", jobId: "", skipped: false };
  const client = new EntityBinaryClient({
    getBatchScope: (): typeof batchScope => batchScope,
    transport: {
      invalidate: (): void => {
        throw new Error("Unexpected invalidation");
      },
      control: async (): Promise<never> => {
        throw new Error("Unexpected control");
      },
      publication: async (input, options): Promise<unknown> => {
        expect(input).toMatchObject({ batchScope });
        expect(options?.signal).toBe(signal);
        return result;
      },
    },
  });
  expect(
    await client.publish(
      {
        operation: "createEntity",
        assetUploadId: ticket,
        request: {
          entity: {
            id: "image",
            entityType: "image",
            content: ref,
            metadata: {},
          },
        },
      },
      { signal },
    ),
  ).toEqual(result);
});

test("binary publication sends a metadata envelope and never falls back after rejection", async () => {
  const primary = new Error("owner rejected publication");
  let calls = 0;
  const request = {
    operation: "createEntity" as const,
    assetUploadId: ticket,
    request: {
      entity: { id: "image", entityType: "image", content: ref, metadata: {} },
    },
  };
  const client = new EntityBinaryClient({
    transport: {
      invalidate: (): void => {
        throw new Error("Unexpected invalidation");
      },
      control: async (): Promise<never> => {
        throw new Error("unexpected control/fallback");
      },
      publication: async (input): Promise<never> => {
        calls++;
        expect(input).toEqual({ request });
        throw primary;
      },
    },
  });
  await assert.rejects(
    client.publish(request),
    (error: unknown) => error === primary,
  );
  expect(calls).toBe(1);
});
