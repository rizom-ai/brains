import { describe, expect, it } from "bun:test";
import {
  BROKER_PROTOCOL_VERSION,
  FrameDecoder,
  MAX_ARGUMENT_BYTES,
  MAX_ARGUMENT_COUNT,
  MAX_FRAME_BYTES,
  ProtocolError,
  assertExecutableArgs,
  encodeFrame,
} from "../../../src/lib/broker/protocol";
import type { BrokerMessage } from "../../../src/lib/broker/protocol";

function executeMessage(
  overrides: Partial<Extract<BrokerMessage, { type: "execute" }>> = {},
): Extract<BrokerMessage, { type: "execute" }> {
  return {
    type: "execute",
    version: BROKER_PROTOCOL_VERSION,
    requestId: "req_0123456789ab",
    repositoryKey: "brain-data",
    operationClass: "inspect",
    args: ["status", "--porcelain=v1"],
    ...overrides,
  };
}

function decodeOne(bytes: Uint8Array): BrokerMessage {
  const messages = new FrameDecoder().push(bytes);
  const first = messages[0];
  if (!first) throw new Error("expected exactly one decoded message");
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

describe("broker protocol framing", () => {
  it("round-trips a well-formed message", () => {
    const message = executeMessage();
    expect(decodeOne(encodeFrame(message))).toEqual(message);
  });

  it("reassembles a message split across chunks", () => {
    const frame = encodeFrame(executeMessage());
    const decoder = new FrameDecoder();
    const split = 3;

    expect(decoder.push(frame.subarray(0, split))).toEqual([]);
    expect(decoder.push(frame.subarray(split))).toEqual([executeMessage()]);
  });

  it("decodes two messages delivered in one chunk", () => {
    const first = encodeFrame(executeMessage());
    const second = encodeFrame(
      executeMessage({ requestId: "req_ba9876543210" }),
    );
    const joined = new Uint8Array(first.length + second.length);
    joined.set(first);
    joined.set(second, first.length);

    expect(new FrameDecoder().push(joined)).toHaveLength(2);
  });

  it("rejects a frame that declares more than the maximum length", () => {
    const oversized = new Uint8Array(4);
    new DataView(oversized.buffer).setUint32(0, MAX_FRAME_BYTES + 1, false);
    const error = protocolErrorFrom(() => new FrameDecoder().push(oversized));

    expect(error.code).toBe("frame-too-large");
  });

  it("rejects a payload that is not valid JSON", () => {
    const body = new TextEncoder().encode("{not json");
    const frame = new Uint8Array(4 + body.length);
    new DataView(frame.buffer).setUint32(0, body.length, false);
    frame.set(body, 4);
    const error = protocolErrorFrom(() => new FrameDecoder().push(frame));

    expect(error.code).toBe("malformed");
  });

  it("rejects a message whose shape does not match its schema", () => {
    const body = new TextEncoder().encode(
      JSON.stringify({ type: "execute", version: BROKER_PROTOCOL_VERSION }),
    );
    const frame = new Uint8Array(4 + body.length);
    new DataView(frame.buffer).setUint32(0, body.length, false);
    frame.set(body, 4);
    const error = protocolErrorFrom(() => new FrameDecoder().push(frame));

    expect(error.code).toBe("malformed");
  });

  it("rejects a mismatched protocol version", () => {
    const error = protocolErrorFrom(() =>
      decodeOne(encodeFrame(executeMessage({ version: 999 }))),
    );

    expect(error.code).toBe("version-mismatch");
  });

  it("refuses to encode a message larger than the frame limit", () => {
    const error = protocolErrorFrom(() =>
      encodeFrame(
        executeMessage({ args: ["status", "x".repeat(MAX_FRAME_BYTES)] }),
      ),
    );

    expect(error.code).toBe("frame-too-large");
  });

  it("keeps credentials out of protocol errors", () => {
    const message = executeMessage({
      operationClass: "network",
      args: ["ls-remote", "https://x-access-token:secret123@example.com/r.git"],
    });
    const error = protocolErrorFrom(() =>
      assertExecutableArgs(message.args, message.operationClass),
    );

    expect(String(error)).not.toContain("secret123");
    expect(String(error)).toContain("<redacted>");
  });
});

describe("broker executable argument policy", () => {
  it("accepts a subcommand permitted for its class", () => {
    expect(() =>
      assertExecutableArgs(["status", "--porcelain=v1"], "inspect"),
    ).not.toThrow();
  });

  it("rejects an empty argument list", () => {
    expect(
      protocolErrorFrom(() => assertExecutableArgs([], "inspect")).code,
    ).toBe("unsupported-operation");
  });

  it("rejects a subcommand outside the closed allow-list", () => {
    const error = protocolErrorFrom(() =>
      assertExecutableArgs(["daemon", "--listen=127.0.0.1"], "network"),
    );

    expect(error.code).toBe("unsupported-operation");
  });

  it("rejects a permitted subcommand requested under the wrong class", () => {
    // `commit` is a real subcommand, but never a read-only one.
    const error = protocolErrorFrom(() =>
      assertExecutableArgs(["commit", "-m", "x"], "inspect"),
    );

    expect(error.code).toBe("unsupported-operation");
  });

  it("rejects an argument containing a NUL byte", () => {
    const error = protocolErrorFrom(() =>
      assertExecutableArgs(["status", "docs\u0000.md"], "inspect"),
    );

    expect(error.code).toBe("invalid-argument");
  });

  it("preserves arguments containing spaces and newlines", () => {
    // Git paths legitimately contain both; only NUL is structurally invalid.
    expect(() =>
      assertExecutableArgs(["add", "my notes/a b\nc.md"], "mutate"),
    ).not.toThrow();
  });

  it("rejects an oversized argument", () => {
    const error = protocolErrorFrom(() =>
      assertExecutableArgs(
        ["status", "x".repeat(MAX_ARGUMENT_BYTES + 1)],
        "inspect",
      ),
    );

    expect(error.code).toBe("invalid-argument");
  });

  it("rejects too many arguments", () => {
    const args = [
      "status",
      ...Array.from({ length: MAX_ARGUMENT_COUNT }, () => "-v"),
    ];
    const error = protocolErrorFrom(() =>
      assertExecutableArgs(args, "inspect"),
    );

    expect(error.code).toBe("invalid-argument");
  });

  it("rejects an argument embedding URL credentials", () => {
    const error = protocolErrorFrom(() =>
      assertExecutableArgs(
        ["clone", "https://token:pw@example.com/r.git"],
        "bootstrap",
      ),
    );

    expect(error.code).toBe("credential-in-argument");
  });

  it("permits clone and init only while bootstrapping", () => {
    expect(() =>
      assertExecutableArgs(["clone", "https://example.com/r.git"], "bootstrap"),
    ).not.toThrow();
    expect(
      protocolErrorFrom(() =>
        assertExecutableArgs(["clone", "https://example.com/r.git"], "network"),
      ).code,
    ).toBe("unsupported-operation");
  });
});
