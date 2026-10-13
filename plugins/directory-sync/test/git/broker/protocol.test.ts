import { describe, expect, it } from "bun:test";
import {
  BROKER_PROTOCOL_VERSION,
  MAX_FRAME_BYTES,
  MAX_PAYLOAD_BYTES,
} from "../../../src/lib/broker/protocol";
import { makeBrokerRpcSerialization } from "../../../src/lib/broker/rpc-serialization";

describe("broker protocol", () => {
  it("uses the new wire version without a legacy facade", () => {
    expect(BROKER_PROTOCOL_VERSION).toBe(2);
  });

  it("carries a payload larger than the operation result bound's old framing ceiling", () => {
    expect(MAX_FRAME_BYTES).toBeGreaterThan(MAX_PAYLOAD_BYTES);
    const message = {
      _tag: "Chunk",
      requestId: 1,
      values: [
        {
          _tag: "Result",
          outcome: "ok",
          value: "x".repeat(2 * 1024 * 1024),
          error: null,
        },
      ],
    };
    const parser = makeBrokerRpcSerialization().makeUnsafe();
    const frame = parser.encode(message);
    expect(frame).toBeInstanceOf(Uint8Array);
    if (!(frame instanceof Uint8Array))
      throw new Error("Expected a byte frame");
    expect(parser.decode(frame)).toEqual([message]);
  });
});
