import { describe, expect, it } from "bun:test";
import {
  BROKER_PROTOCOL_VERSION,
  MAX_FRAME_BYTES,
  ProtocolError,
} from "../../../src/lib/broker/protocol";
import { makeBrokerRpcSerialization } from "../../../src/lib/broker/rpc-serialization";

function frame(value: unknown): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const output = new Uint8Array(4 + bytes.length);
  new DataView(output.buffer).setUint32(0, bytes.length, false);
  output.set(bytes, 4);
  return output;
}

function request(
  operation: unknown = { name: "get-status" },
): Record<string, unknown> {
  return {
    _tag: "Request",
    id: "rpc-1",
    tag: "ExecuteOperation",
    payload: {
      operationId: "req_serialization_1",
      checkoutPath: "/checkout",
      operation,
    },
    headers: [],
  };
}

function wire(message: unknown): Record<string, unknown> {
  return { version: BROKER_PROTOCOL_VERSION, message };
}

function protocolError(action: () => unknown): ProtocolError {
  try {
    action();
  } catch (error) {
    if (error instanceof ProtocolError) return error;
    throw error;
  }
  throw new Error("Expected a protocol failure");
}

describe("bounded broker RPC serialization", () => {
  it("round-trips frames split at every header/body boundary", () => {
    const serialization = makeBrokerRpcSerialization();
    const message = request({ name: "commit", message: "世界🙂" });
    const bytes = frame(wire(message));
    for (let position = 1; position < bytes.length; position++) {
      const parser = serialization.makeUnsafe();
      expect(parser.decode(bytes.subarray(0, position))).toEqual([]);
      expect(parser.retainedBytes).toBe(position < 4 ? position : bytes.length);
      expect(parser.decode(bytes.subarray(position))).toEqual([message]);
      expect(parser.retainedBytes).toBe(0);
    }
  });

  it("encodes bounded batches as independent length-prefixed frames", () => {
    const parser = makeBrokerRpcSerialization({
      maxFrameBytes: 256,
    }).makeUnsafe();
    const messages = [{ _tag: "Ping" }, { _tag: "Pong" }];
    const bytes = parser.encode(messages);
    expect(bytes).toBeInstanceOf(Uint8Array);
    if (bytes instanceof Uint8Array)
      expect(parser.decode(bytes)).toEqual(messages);
    expect(parser.encode([])).toBeUndefined();
    expect(
      protocolError(() =>
        parser.encode(Array.from({ length: 20 }, () => ({ _tag: "Ping" }))),
      ).code,
    ).toBe("frame-too-large");
  });

  it("rejects empty declared frames", () => {
    const parser = makeBrokerRpcSerialization().makeUnsafe();
    expect(protocolError(() => parser.decode(new Uint8Array(4))).code).toBe(
      "malformed",
    );
    expect(parser.retainedBytes).toBe(0);
  });

  it("accepts the original strict checkpoint shape", () => {
    const message = request({
      name: "get-reconciliation-delta",
      checkpoint: {
        remoteFingerprint: "a".repeat(64),
        branch: "main",
        lastReconciledGitHead: "b".repeat(40),
      },
    });
    expect(
      makeBrokerRpcSerialization()
        .makeUnsafe()
        .decode(frame(wire(message))),
    ).toEqual([message]);
  });

  it("decodes coalesced frames without recursive growth", () => {
    const bytes = frame(wire({ _tag: "Ping" }));
    const batch = new Uint8Array(bytes.length * 20_000);
    for (let offset = 0; offset < batch.length; offset += bytes.length) {
      batch.set(bytes, offset);
    }
    const parser = makeBrokerRpcSerialization().makeUnsafe();
    expect(parser.decode(batch)).toHaveLength(20_000);
    expect(parser.retainedBytes).toBe(0);
  });

  it("refuses oversized declared lengths before retaining their bodies", () => {
    const parser = makeBrokerRpcSerialization().makeUnsafe();
    const chunk = new Uint8Array(4 + 1024);
    new DataView(chunk.buffer).setUint32(0, MAX_FRAME_BYTES + 1, false);
    expect(protocolError(() => parser.decode(chunk)).code).toBe(
      "frame-too-large",
    );
    expect(parser.retainedBytes).toBe(0);
    expect(() => parser.decode(frame(wire({ _tag: "Ping" })))).toThrow();
  });

  it("checks encoded UTF-8 bytes, not string length", () => {
    const parser = makeBrokerRpcSerialization({
      maxFrameBytes: 256,
    }).makeUnsafe();
    const message = {
      _tag: "Request",
      id: "rpc-1",
      tag: "RegisterCheckout",
      payload: {
        checkoutPath: "🙂".repeat(40),
        branch: "main",
        remoteFingerprint: "local",
      },
      headers: [],
    };
    expect(JSON.stringify(wire(message)).length).toBeLessThan(256);
    expect(protocolError(() => parser.encode(message)).code).toBe(
      "frame-too-large",
    );
  });

  it("rejects invalid UTF-8 and malformed JSON visibly", () => {
    const invalid = new Uint8Array([0, 0, 0, 1, 0xff]);
    expect(
      protocolError(() =>
        makeBrokerRpcSerialization().makeUnsafe().decode(invalid),
      ).code,
    ).toBe("malformed");
    const invalidJson = new Uint8Array([0, 0, 0, 1, 0x7b]);
    expect(
      protocolError(() =>
        makeBrokerRpcSerialization().makeUnsafe().decode(invalidJson),
      ).code,
    ).toBe("malformed");
  });

  it("rejects version drift without a legacy fallback", () => {
    expect(
      protocolError(() =>
        makeBrokerRpcSerialization()
          .makeUnsafe()
          .decode(
            frame({
              version: BROKER_PROTOCOL_VERSION + 1,
              message: { _tag: "Ping" },
            }),
          ),
      ).code,
    ).toBe("version-mismatch");
  });

  it.each([
    ["wire wrapper", { ...wire(request()), extra: true }],
    ["request envelope", wire({ ...request(), argv: ["--amend"] })],
    ["operation", wire(request({ name: "commit", argv: ["--amend"] }))],
    [
      "checkpoint",
      wire(
        request({
          name: "get-reconciliation-delta",
          checkpoint: {
            remoteFingerprint: "a".repeat(64),
            branch: "main",
            lastReconciledGitHead: "b".repeat(40),
            extra: true,
          },
        }),
      ),
    ],
  ])(
    "rejects extra keys in the %s before RPC decoding",
    (_label: string, value: unknown): void => {
      expect(
        protocolError(() =>
          makeBrokerRpcSerialization().makeUnsafe().decode(frame(value)),
        ).code,
      ).toBe("malformed");
    },
  );
});
