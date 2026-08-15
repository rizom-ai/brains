import { describe, expect, it } from "bun:test";
import {
  BROKER_PROTOCOL_VERSION,
  FrameDecoder,
  MAX_FRAME_BYTES,
  MAX_PAYLOAD_BYTES,
  ProtocolError,
  encodeFrame,
} from "../../../src/lib/broker/protocol";
import type {
  BrokerMessage,
  ExecuteOperationMessage,
} from "../../../src/lib/broker/protocol";
import { SocketWriter } from "../../../src/lib/broker/socket-writer";

/**
 * Phase 2 transport. Each assertion here corresponds to a way the superseded
 * implementation silently stranded a finished operation — the same wedge the
 * broker exists to remove, arriving through the transport rather than the
 * runtime.
 */

function execute(
  overrides: Partial<ExecuteOperationMessage> = {},
): ExecuteOperationMessage {
  return {
    type: "execute-operation",
    version: BROKER_PROTOCOL_VERSION,
    requestId: "req_0123456789ab",
    checkoutPath: "/brain/data",
    operation: { name: "commit", message: "hello" },
    ...overrides,
  };
}

function decodeOne(bytes: Uint8Array): BrokerMessage {
  const [first] = new FrameDecoder().push(bytes);
  if (!first) throw new Error("expected one decoded message");
  return first;
}

function protocolErrorFrom(action: () => unknown): ProtocolError {
  try {
    action();
  } catch (error) {
    if (error instanceof ProtocolError) return error;
    throw error;
  }
  throw new Error("expected a ProtocolError");
}

function frameOf(body: string): Uint8Array {
  const encoded = new TextEncoder().encode(body);
  const frame = new Uint8Array(4 + encoded.length);
  new DataView(frame.buffer).setUint32(0, encoded.length, false);
  frame.set(encoded, 4);
  return frame;
}

describe("broker protocol", () => {
  it("round-trips an operation and reassembles split chunks", () => {
    const frame = encodeFrame(execute());
    expect(decodeOne(frame)).toEqual(execute());

    const decoder = new FrameDecoder();
    expect(decoder.push(frame.subarray(0, 3))).toEqual([]);
    expect(decoder.push(frame.subarray(3))).toEqual([execute()]);
  });

  it("carries a payload larger than any single operation result bound", () => {
    // A frame limit below the payload bound is what silently stranded results
    // before: the send threw, was swallowed, and the caller waited forever.
    expect(MAX_FRAME_BYTES).toBeGreaterThan(MAX_PAYLOAD_BYTES);

    const value = "x".repeat(2 * 1024 * 1024);
    const result: BrokerMessage = {
      type: "result",
      version: BROKER_PROTOCOL_VERSION,
      requestId: "req_0123456789ab",
      outcome: "ok",
      value,
      error: null,
    };

    const decoded = decodeOne(encodeFrame(result));
    expect(decoded.type).toBe("result");
    expect(decoded).toEqual(result);
  });

  it("rejects a declared length beyond the limit before allocating", () => {
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, MAX_FRAME_BYTES + 1, false);

    expect(protocolErrorFrom(() => new FrameDecoder().push(header)).code).toBe(
      "frame-too-large",
    );
  });

  it("rejects malformed bodies and version drift", () => {
    expect(protocolErrorFrom(() => decodeOne(frameOf("{nope"))).code).toBe(
      "malformed",
    );
    expect(
      protocolErrorFrom(() =>
        decodeOne(frameOf(JSON.stringify({ type: "execute-operation" }))),
      ).code,
    ).toBe("malformed");
    expect(
      protocolErrorFrom(() => decodeOne(encodeFrame(execute({ version: 999 }))))
        .code,
    ).toBe("version-mismatch");
  });

  it("refuses an argument vector smuggled onto a message", () => {
    // Strict schemas: Zod strips unknown keys by default, which would let argv
    // ride along on a known operation and defeat the operation boundary.
    expect(
      protocolErrorFrom(() =>
        decodeOne(frameOf(JSON.stringify({ ...execute(), args: ["--amend"] }))),
      ).code,
    ).toBe("malformed");
  });
});

describe("socket writer", () => {
  it("retains what the socket refused and sends it on drain", () => {
    const accepted: number[] = [];
    let capacity = 4;
    const writer = new SocketWriter({
      write: (data): number => {
        const written = Math.min(capacity, data.length);
        accepted.push(written);
        return written;
      },
    });

    writer.send(new Uint8Array(10));
    // A partial write that is treated as complete leaves the peer holding an
    // incomplete frame it waits on forever.
    expect(accepted).toEqual([4]);
    expect(writer.pendingBytes).toBe(6);

    capacity = 100;
    writer.flush();
    expect(writer.pendingBytes).toBe(0);
  });

  it("drops nothing while the peer keeps accepting", () => {
    let total = 0;
    const writer = new SocketWriter({
      write: (data): number => {
        total += data.length;
        return data.length;
      },
    });

    writer.send(encodeFrame(execute()));
    writer.send(encodeFrame(execute()));

    expect(writer.pendingBytes).toBe(0);
    expect(total).toBe(encodeFrame(execute()).length * 2);
  });

  it("discards its buffer when the peer is gone rather than throwing", () => {
    const writer = new SocketWriter({
      write: (): number => {
        throw new Error("socket closed");
      },
    });

    // The client is detached, not cancelled: the broker still owns the
    // operation to completion.
    expect(() => writer.send(new Uint8Array(8))).not.toThrow();
    expect(writer.pendingBytes).toBe(0);
  });
});
