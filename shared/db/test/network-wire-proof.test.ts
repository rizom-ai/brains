import { describe, it, expect } from "bun:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { Worker } from "node:worker_threads";
import { NetworkTransferBudget } from "../src/turso-worker/network-budget";
import {
  encodeCredit,
  decodeCredit,
  encodeData,
  decodeData,
  readInto,
  NETWORK_SCRATCH_BYTES,
  NETWORK_BORROW_BYTES,
} from "../src/turso-worker/network-wire";
import { STAGE_CHUNK_BYTES } from "../src/turso-worker/binary-protocol";

describe("bounded raw network ingress", () => {
  it("validates direction, exact headers, credit and size before reading a declared body", () => {
    const credit = { sequence: 7, credit: crypto.randomUUID() };
    expect(decodeCredit(encodeCredit(credit))).toEqual(credit);
    assert.deepEqual(
      decodeData(
        encodeData({ ...credit, kind: "chunk", size: STAGE_CHUNK_BYTES }),
        credit,
      ),
      { ...credit, kind: "chunk", size: STAGE_CHUNK_BYTES },
    );
    assert.deepEqual(
      decodeData(encodeData({ ...credit, kind: "finish", size: 0 }), credit),
      { ...credit, kind: "finish", size: 0 },
    );
    assert.throws(() => decodeData(encodeCredit(credit), credit), /header/);
    const malformed = encodeData({ ...credit, kind: "chunk", size: 3 });
    malformed[0] = 0x53;
    assert.throws(() => decodeData(malformed, credit), /header/);
    const nonAscii = encodeData({ ...credit, kind: "chunk", size: 3 });
    nonAscii[5] = 0xff;
    assert.throws(() => decodeData(nonAscii, credit));
    for (const size of [0, STAGE_CHUNK_BYTES + 1, 0xffffffff])
      assert.throws(
        () =>
          decodeData(encodeData({ ...credit, kind: "chunk", size }), credit),
        /size|credit/,
      );
    assert.throws(
      () =>
        decodeData(encodeData({ ...credit, kind: "finish", size: 1 }), credit),
      /size/,
    );
    assert.throws(
      () =>
        decodeData(
          encodeData({ ...credit, sequence: 8, kind: "chunk", size: 3 }),
          credit,
        ),
      /sequence/,
    );
    assert.throws(
      () =>
        decodeData(
          encodeData({
            ...credit,
            credit: crypto.randomUUID(),
            kind: "chunk",
            size: 3,
          }),
          credit,
        ),
      /sequence/,
    );
  });
  it("copies only visible borrowed bytes, handles fragmentation and leaves backing attached", async () => {
    const source = new PassThrough();
    const destination = new Uint8Array(3);
    const backing = Buffer.alloc(NETWORK_BORROW_BYTES, 0xa5);
    backing.set([1, 2, 3], 123);
    const copied = readInto(source, destination);
    source.write(backing.subarray(123, 124));
    source.end(backing.subarray(124, 126));
    await copied;
    expect([...destination]).toEqual([1, 2, 3]);
    assert.equal(backing.byteLength, NETWORK_BORROW_BYTES);
    assert.equal(backing[122], 0xa5);
  });
  it("rejects excess receive requests, large borrowed backing and premature EOF", async () => {
    const source = new PassThrough();
    await assert.rejects(
      readInto(source, new Uint8Array(STAGE_CHUNK_BYTES + 1)),
      /exceeds credit/,
    );
    const backing = Buffer.alloc(NETWORK_BORROW_BYTES + 1);
    const rejected = assert.rejects(
      readInto(source, new Uint8Array(3)),
      /receive backing/,
    );
    source.end(backing.subarray(0, 3));
    await rejected;
    expect(backing.byteLength).toBe(NETWORK_BORROW_BYTES + 1);
    const partial = new PassThrough();
    const incomplete = assert.rejects(
      readInto(partial, new Uint8Array(3)),
      /ended/,
    );
    partial.end(Buffer.from([1, 2]));
    await incomplete;
  });
  it("admits two bridge lifetimes before construction and refunds only actual bound exits", async () => {
    const budget = new NetworkTransferBudget("ingress");
    const url = new URL(
      "./fixtures/turso-thread/upload-producer.ts",
      import.meta.url,
    );
    assert.throws(
      () =>
        budget.spawn(() => {
          throw new Error("Injected startup failure");
        }),
      /startup failure/,
    );
    assert.equal(budget.stats().slots, 0);
    const first = budget.spawn(
      () => new Worker(url, { workerData: { size: 0 } }),
    );
    const terminate = first.terminate.bind(first);
    try {
      assert.throws(() => budget.spawn(() => first), /new live bridge/);
      assert.equal(budget.stats().slots, 1);
      const second = budget.spawn(
        () => new Worker(url, { workerData: { size: 0 } }),
      );
      try {
        let spawned = false;
        assert.throws(
          () =>
            budget.spawn(() => {
              spawned = true;
              return first;
            }),
          /capacity exceeded/,
        );
        assert.equal(spawned, false);
        first.terminate = (): Promise<number> =>
          Promise.reject(new Error("Injected termination failure"));
        await assert.rejects(first.terminate(), /termination failure/);
        expect(budget.stats()).toEqual({
          slots: 2,
          reservedBytes: 2 * NETWORK_SCRATCH_BYTES,
        });
      } finally {
        await second.terminate();
      }
    } finally {
      await terminate();
    }
    assert.equal(budget.stats().slots, 0);
  });
});
