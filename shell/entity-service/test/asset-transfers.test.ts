import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { MAX_ASSET_BYTES, prepareAsset } from "@brains/assets";
import {
  EntityAssetTransfers,
  ASSET_RPC_CHUNK_BYTES,
} from "../src/asset-transfers";

function rejected(promise: Promise<unknown>): Promise<Error> {
  return promise.then<never, Error>(
    () => {
      throw new Error("Expected rejection");
    },
    (error: unknown) =>
      error instanceof Error ? error : new Error(String(error)),
  );
}

const asset = prepareAsset(new Uint8Array([0, 1, 128, 255]));

describe("connection-owned asset transfers", () => {
  it("assembles ordered byte views and consumes verified bytes exactly once", async () => {
    const transfers = new EntityAssetTransfers(4);
    const connection = new AbortController();
    const id = transfers.begin(asset, connection.signal, randomUUID());
    transfers.append(id, 0, asset.bytes.subarray(0, 2), connection.signal);
    transfers.append(id, 2, asset.bytes.subarray(2), connection.signal);
    expect(
      await transfers.consume(
        id,
        connection.signal,
        async (received) => received,
      ),
    ).toEqual(asset);
    expect(
      (
        await rejected(
          transfers.consume(id, connection.signal, async () => true),
        )
      ).message,
    ).toContain("Unknown asset upload");
    expect(
      transfers.begin(asset, connection.signal, randomUUID()),
    ).toBeString();
    connection.abort();
  });

  it("bounds bytes and slots before allocating, and releases discarded uploads", () => {
    const transfers = new EntityAssetTransfers(4, 1);
    const connection = new AbortController();
    const id = transfers.begin(asset, connection.signal, randomUUID());
    expect(() =>
      transfers.begin(asset, connection.signal, randomUUID()),
    ).toThrow("capacity");
    expect(() =>
      transfers.begin(
        prepareAsset(new Uint8Array()),
        connection.signal,
        randomUUID(),
      ),
    ).toThrow("capacity");
    transfers.discard(id, connection.signal);
    transfers.discard(id, connection.signal);
    expect(
      transfers.begin(asset, connection.signal, randomUUID()),
    ).toBeString();
    connection.abort();
    const largeBudget = new EntityAssetTransfers(MAX_ASSET_BYTES * 2);
    expect(() =>
      largeBudget.begin(
        { ...asset, sizeBytes: MAX_ASSET_BYTES + 1 },
        new AbortController().signal,
        randomUUID(),
      ),
    ).toThrow("capacity");
  });

  it("does not let another connection append, consume or discard an upload", async () => {
    const transfers = new EntityAssetTransfers(4);
    const owner = new AbortController();
    const other = new AbortController();
    const id = transfers.begin(asset, owner.signal, randomUUID());
    expect(() => transfers.append(id, 0, asset.bytes, other.signal)).toThrow(
      "Unknown",
    );
    expect(() => transfers.discard(id, other.signal)).toThrow("Unknown");
    expect(
      (await rejected(transfers.consume(id, other.signal, async () => true)))
        .message,
    ).toContain("Unknown");
    transfers.append(id, 0, asset.bytes, owner.signal);
    expect(await transfers.consume(id, owner.signal, async () => true)).toBe(
      true,
    );
  });

  it("rejects duplicate IDs without replacing the original upload", async () => {
    const transfers = new EntityAssetTransfers(8);
    const connection = new AbortController();
    const id = transfers.begin(asset, connection.signal, randomUUID());
    expect(() => transfers.begin(asset, connection.signal, id)).toThrow(
      "Duplicate",
    );
    transfers.append(id, 0, asset.bytes, connection.signal);
    expect(
      await transfers.consume(
        id,
        connection.signal,
        async (received) => received.digest,
      ),
    ).toBe(asset.digest);
  });

  it("discards out-of-order, oversized and overflowing chunks", () => {
    const transfers = new EntityAssetTransfers(4);
    const connection = new AbortController();
    for (const [offset, bytes] of [
      [1, asset.bytes],
      [0, new Uint8Array(5)],
      [0, new Uint8Array(ASSET_RPC_CHUNK_BYTES + 1)],
      [0, new Uint8Array()],
    ] as const) {
      const id = transfers.begin(asset, connection.signal, randomUUID());
      expect(() =>
        transfers.append(id, offset, bytes, connection.signal),
      ).toThrow("Invalid");
      expect(() =>
        transfers.append(id, 0, asset.bytes, connection.signal),
      ).toThrow("Unknown");
    }
  });

  it("never invokes a mutation with incomplete or corrupt bytes", async () => {
    const transfers = new EntityAssetTransfers(4);
    const connection = new AbortController();
    let mutations = 0;
    const mutate = async (): Promise<void> => {
      mutations++;
    };
    const incomplete = transfers.begin(asset, connection.signal, randomUUID());
    transfers.append(
      incomplete,
      0,
      asset.bytes.subarray(0, 2),
      connection.signal,
    );
    expect(
      (await rejected(transfers.consume(incomplete, connection.signal, mutate)))
        .message,
    ).toContain("incomplete");
    const corrupt = transfers.begin(asset, connection.signal, randomUUID());
    transfers.append(corrupt, 0, new Uint8Array(4), connection.signal);
    expect(
      (await rejected(transfers.consume(corrupt, connection.signal, mutate)))
        .message,
    ).toContain("digest mismatch");
    expect(mutations).toBe(0);
    connection.abort();
  });

  it("releases disconnected uploads, but retains admission quota until a mutation settles", async () => {
    const transfers = new EntityAssetTransfers(4);
    const abandoned = new AbortController();
    transfers.begin(asset, abandoned.signal, randomUUID());
    abandoned.abort();
    const connection = new AbortController();
    const id = transfers.begin(asset, connection.signal, randomUUID());
    transfers.append(id, 0, asset.bytes, connection.signal);
    const gate = Promise.withResolvers<boolean>();
    const consume = transfers.consume(
      id,
      connection.signal,
      () => gate.promise,
    );
    expect(
      (
        await rejected(
          transfers.consume(id, connection.signal, async () => false),
        )
      ).message,
    ).toContain("already being consumed");
    transfers.discard(id, connection.signal);
    connection.abort();
    const next = new AbortController();
    expect(() => transfers.begin(asset, next.signal, randomUUID())).toThrow(
      "capacity",
    );
    gate.resolve(true);
    expect(await consume).toBe(true);
    expect(transfers.begin(asset, next.signal, randomUUID())).toBeString();
    next.abort();
  });

  it("frees capacity after a failed mutation without pretending it succeeded", async () => {
    const transfers = new EntityAssetTransfers(4);
    const connection = new AbortController();
    const id = transfers.begin(asset, connection.signal, randomUUID());
    transfers.append(id, 0, asset.bytes, connection.signal);
    expect(
      (
        await rejected(
          transfers.consume(id, connection.signal, async () => {
            throw new Error("rollback");
          }),
        )
      ).message,
    ).toBe("rollback");
    expect(
      transfers.begin(asset, connection.signal, randomUUID()),
    ).toBeString();
    connection.abort();
  });
});
