import { Schema } from "@brains/utils/effect/rpc";
import type { RpcSerialization } from "@brains/utils/effect/rpc";
import { z } from "@brains/utils/zod";
import {
  BROKER_PROTOCOL_VERSION,
  MAX_FRAME_BYTES,
  ProtocolError,
} from "./protocol";
import { isBrokerRpcMessage } from "./rpc-contract";

const HEADER_BYTES = 4;
const encoder = new TextEncoder();
const wireSchema = z.strictObject({
  version: z.number().int().nonnegative(),
  message: z.unknown(),
});

export interface BrokerRpcParser extends RpcSerialization.Parser {
  /** Allocated partial-frame storage, including an unfinished body. */
  readonly retainedBytes: number;
}

export type BrokerRpcSerialization = Omit<
  RpcSerialization.RpcSerialization["Service"],
  "makeUnsafe"
> & {
  readonly makeUnsafe: () => BrokerRpcParser;
};

/** Stateful byte framing, not newline splitting or string-code-unit bounds. */
export function makeBrokerRpcSerialization(
  options: { maxFrameBytes?: number } = {},
): BrokerRpcSerialization {
  const limit = options.maxFrameBytes ?? MAX_FRAME_BYTES;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_FRAME_BYTES) {
    throw new RangeError("Invalid broker RPC frame limit");
  }

  return {
    contentType: "application/x-brain-git-rpc",
    includesFraming: true,
    codecFor: Schema.toCodecJson,
    makeUnsafe: (): BrokerRpcParser => {
      const header = new Uint8Array(HEADER_BYTES);
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let headerBytes = 0;
      let body: Uint8Array | undefined;
      let bodyBytes = 0;
      let failed = false;

      const checkMessage = (value: unknown): unknown => {
        if (!isBrokerRpcMessage(value)) {
          throw new ProtocolError("malformed", "Invalid broker RPC message");
        }
        return value;
      };
      const decodeBody = (bytes: Uint8Array): unknown => {
        let value: unknown;
        try {
          value = JSON.parse(decoder.decode(bytes));
        } catch {
          throw new ProtocolError(
            "malformed",
            "Frame body is not valid UTF-8 JSON",
          );
        }
        const wire = wireSchema.safeParse(value);
        if (!wire.success) {
          throw new ProtocolError(
            "malformed",
            "Invalid broker RPC frame wrapper",
          );
        }
        if (wire.data.version !== BROKER_PROTOCOL_VERSION) {
          throw new ProtocolError(
            "version-mismatch",
            `Broker protocol version ${wire.data.version} is not ${BROKER_PROTOCOL_VERSION}`,
          );
        }
        return checkMessage(wire.data.message);
      };
      const encodeMessage = (value: unknown): Uint8Array => {
        const message = checkMessage(value);
        const json = JSON.stringify({
          version: BROKER_PROTOCOL_VERSION,
          message,
        });
        // Count before allocating the encoded body, including surrogate handling.
        const length = Buffer.byteLength(json, "utf8");
        if (length > limit) {
          throw new ProtocolError(
            "frame-too-large",
            `RPC frame has ${length} bytes; limit is ${limit}`,
          );
        }
        const frame = new Uint8Array(HEADER_BYTES + length);
        new DataView(frame.buffer).setUint32(0, length, false);
        frame.set(encoder.encode(json), HEADER_BYTES);
        return frame;
      };

      return {
        get retainedBytes(): number {
          return headerBytes + (body?.byteLength ?? 0);
        },
        decode: (chunk): ReadonlyArray<unknown> => {
          if (failed)
            throw new ProtocolError(
              "malformed",
              "RPC parser is closed after a framing failure",
            );
          const output: unknown[] = [];
          let position = 0;
          try {
            if (typeof chunk === "string") {
              throw new ProtocolError(
                "malformed",
                "Broker RPC requires byte frames",
              );
            }
            while (position < chunk.length) {
              if (!body) {
                const count = Math.min(
                  HEADER_BYTES - headerBytes,
                  chunk.length - position,
                );
                header.set(
                  chunk.subarray(position, position + count),
                  headerBytes,
                );
                headerBytes += count;
                position += count;
                if (headerBytes < HEADER_BYTES) break;
                const length = new DataView(header.buffer).getUint32(0, false);
                if (length > limit) {
                  throw new ProtocolError(
                    "frame-too-large",
                    `Frame declares ${length} bytes; limit is ${limit}`,
                  );
                }
                if (length === 0)
                  throw new ProtocolError("malformed", "Empty RPC frame");
                body = new Uint8Array(length);
              }
              const count = Math.min(
                body.length - bodyBytes,
                chunk.length - position,
              );
              body.set(chunk.subarray(position, position + count), bodyBytes);
              bodyBytes += count;
              position += count;
              if (bodyBytes < body.length) break;
              output.push(decodeBody(body));
              headerBytes = 0;
              bodyBytes = 0;
              body = undefined;
            }
            return output;
          } catch (error) {
            failed = true;
            headerBytes = 0;
            bodyBytes = 0;
            body = undefined;
            throw error;
          }
        },
        encode: (values): Uint8Array | undefined => {
          if (!Array.isArray(values)) return encodeMessage(values);
          if (values.length === 0) return undefined;
          const frames: Uint8Array[] = [];
          let length = 0;
          for (const value of values) {
            const frame = encodeMessage(value);
            length += frame.length;
            if (length > limit + HEADER_BYTES) {
              throw new ProtocolError(
                "frame-too-large",
                "RPC frame batch exceeds the output limit",
              );
            }
            frames.push(frame);
          }
          const batch = new Uint8Array(length);
          let position = 0;
          for (const frame of frames) {
            batch.set(frame, position);
            position += frame.length;
          }
          return batch;
        },
      };
    },
  };
}
