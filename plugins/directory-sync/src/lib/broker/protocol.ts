import { z } from "@brains/utils/zod";
import { gitOperationSchema } from "./operations";
import type { GitOperation } from "./operations";

/**
 * Wire contract between a broker client and the broker.
 *
 * Three constraints here were learned the expensive way in the superseded
 * implementation, and each one silently strands a finished operation if got
 * wrong — the exact failure this whole design exists to remove:
 *
 * 1. **The frame limit must exceed the largest payload.** A limit below the
 *    result bound made oversized results throw inside the send path, get
 *    swallowed, and leave the caller waiting forever for work that had already
 *    completed.
 * 2. **A declared length is checked before anything is allocated for it**, so
 *    a hostile or corrupt prefix costs nothing.
 * 3. **Schemas are strict.** Zod strips unknown keys by default, which would
 *    let an argument vector ride along on a known operation.
 */

export const BROKER_PROTOCOL_VERSION = 1;

/** Frames must carry a full bounded result; `show-file` can be megabytes. */
export const MAX_FRAME_BYTES: number = 8 * 1024 * 1024;

/** Ceiling for any single retained payload, enforced before framing. */
export const MAX_PAYLOAD_BYTES: number = 4 * 1024 * 1024;

const FRAME_HEADER_BYTES = 4;

export interface RegisterCheckoutMessage {
  type: "register-checkout";
  version: number;
  requestId: string;
  checkoutPath: string;
  branch: string;
  remoteFingerprint: string;
}

export interface ExecuteOperationMessage {
  type: "execute-operation";
  version: number;
  requestId: string;
  checkoutPath: string;
  operation: GitOperation;
}

export interface ProgressMessage {
  type: "progress";
  version: number;
  requestId: string;
  phase: "running";
  observedAt: string;
}

export interface ResultMessage {
  type: "result";
  version: number;
  requestId: string;
  outcome: "ok" | "error";
  /** Operation-specific payload, already typed by the operation contract. */
  value: unknown;
  error: string | null;
}

/**
 * A role reporting that it has reconciled what the previous owner left.
 *
 * The broker cannot do this itself: the queue and the durable checkpoint
 * live in the app. So it holds mutations until one role says the checkout
 * has been accounted for.
 */
export interface OpenAdmissionMessage {
  type: "open-admission";
  version: number;
  requestId: string;
}

export interface QueryMessage {
  type: "query";
  version: number;
  requestId: string;
}

export interface StatusMessage {
  type: "status";
  version: number;
  requestId: string;
  brokerId: string;
  checkouts: string[];
  activeRequestIds: string[];
  /** Accepted and waiting for a turn; waiting is not stalling. */
  queuedRequestIds: string[];
  /** Requests the previous generation started and never settled. */
  ambiguousRequestIds: string[];
  /** False when the previous generation's record could not be read whole. */
  evidenceComplete: boolean;
  /** False while this owner is holding mutations pending reconciliation. */
  admitsMutations: boolean;
  /**
   * Epoch millis of the least recently advanced active operation, or null when
   * nothing is active. Progress age, not start age: a slow clone that keeps
   * producing output is healthy, and one that stops is not.
   */
  oldestActiveProgressAt: number | null;
}

export interface HeartbeatMessage {
  type: "heartbeat";
  version: number;
  brokerId: string;
  observedAt: string;
}

export type BrokerMessage =
  | RegisterCheckoutMessage
  | QueryMessage
  | OpenAdmissionMessage
  | ExecuteOperationMessage
  | ProgressMessage
  | ResultMessage
  | StatusMessage
  | HeartbeatMessage;

export type ProtocolErrorCode =
  "frame-too-large" | "malformed" | "version-mismatch";

export class ProtocolError extends Error {
  readonly code: ProtocolErrorCode;

  constructor(code: ProtocolErrorCode, message: string) {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
  }
}

const requestId = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);
const version = z.number().int().nonnegative();
const timestamp = z.string().min(1).max(64);

export const brokerMessageSchema: z.ZodType<BrokerMessage, BrokerMessage> =
  z.discriminatedUnion("type", [
    z
      .object({
        type: z.literal("register-checkout"),
        version,
        requestId,
        checkoutPath: z.string().min(1),
        branch: z.string().min(1),
        remoteFingerprint: z.string().min(1),
      })
      .strict(),
    z
      .object({
        type: z.literal("execute-operation"),
        version,
        requestId,
        checkoutPath: z.string().min(1),
        operation: gitOperationSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal("progress"),
        version,
        requestId,
        phase: z.literal("running"),
        observedAt: timestamp,
      })
      .strict(),
    z
      .object({
        type: z.literal("result"),
        version,
        requestId,
        outcome: z.enum(["ok", "error"]),
        value: z.unknown(),
        error: z.string().nullable(),
      })
      .strict(),
    z.object({ type: z.literal("query"), version, requestId }).strict(),
    z
      .object({ type: z.literal("open-admission"), version, requestId })
      .strict(),
    z
      .object({
        type: z.literal("status"),
        version,
        requestId,
        brokerId: z.string().min(1),
        checkouts: z.array(z.string()),
        activeRequestIds: z.array(requestId),
        queuedRequestIds: z.array(requestId),
        ambiguousRequestIds: z.array(requestId),
        evidenceComplete: z.boolean(),
        admitsMutations: z.boolean(),
        oldestActiveProgressAt: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    z
      .object({
        type: z.literal("heartbeat"),
        version,
        brokerId: z.string().min(1),
        observedAt: timestamp,
      })
      .strict(),
  ]);

export function encodeFrame(message: BrokerMessage): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(message));
  if (body.length > MAX_FRAME_BYTES) {
    throw new ProtocolError(
      "frame-too-large",
      `Refusing to send a ${body.length}-byte frame; the limit is ${MAX_FRAME_BYTES}`,
    );
  }
  const frame = new Uint8Array(FRAME_HEADER_BYTES + body.length);
  new DataView(frame.buffer).setUint32(0, body.length, false);
  frame.set(body, FRAME_HEADER_BYTES);
  return frame;
}

function decodeBody(body: Uint8Array): BrokerMessage {
  const parsed = ((): unknown => {
    try {
      return JSON.parse(new TextDecoder().decode(body));
    } catch {
      throw new ProtocolError("malformed", "Frame body is not valid JSON");
    }
  })();

  const result = brokerMessageSchema.safeParse(parsed);
  if (!result.success) {
    throw new ProtocolError(
      "malformed",
      `Frame body does not match any broker message: ${result.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`,
    );
  }
  if (result.data.version !== BROKER_PROTOCOL_VERSION) {
    throw new ProtocolError(
      "version-mismatch",
      `Broker protocol version ${result.data.version} is not ${BROKER_PROTOCOL_VERSION}`,
    );
  }
  return result.data;
}

/**
 * Reassembles length-prefixed frames from a byte stream, separately from any
 * socket so framing is testable without one.
 */
export class FrameDecoder {
  #buffer: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): BrokerMessage[] {
    const combined = new Uint8Array(this.#buffer.length + chunk.length);
    combined.set(this.#buffer);
    combined.set(chunk, this.#buffer.length);
    this.#buffer = combined;
    return this.#drain([]);
  }

  #drain(decoded: BrokerMessage[]): BrokerMessage[] {
    if (this.#buffer.length < FRAME_HEADER_BYTES) return decoded;

    const length = new DataView(
      this.#buffer.buffer,
      this.#buffer.byteOffset,
      FRAME_HEADER_BYTES,
    ).getUint32(0, false);

    if (length > MAX_FRAME_BYTES) {
      throw new ProtocolError(
        "frame-too-large",
        `Frame declares ${length} bytes; the limit is ${MAX_FRAME_BYTES}`,
      );
    }
    if (this.#buffer.length < FRAME_HEADER_BYTES + length) return decoded;

    const message = decodeBody(
      this.#buffer.subarray(FRAME_HEADER_BYTES, FRAME_HEADER_BYTES + length),
    );
    this.#buffer = this.#buffer.slice(FRAME_HEADER_BYTES + length);
    return this.#drain([...decoded, message]);
  }
}
