import { z } from "@brains/utils/zod";
import { gitOperationSchema } from "./operations";

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

const requestId: z.ZodString = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);
const version: z.ZodNumber = z.number().int().nonnegative();
const timestamp: z.ZodString = z.string().min(1).max(64);

type Strict<Shape extends z.ZodRawShape> = z.ZodObject<Shape, z.core.$strict>;

export const brokerMessageSchema: z.ZodDiscriminatedUnion<
  [
    Strict<{
      type: z.ZodLiteral<"register-checkout">;
      version: z.ZodNumber;
      requestId: z.ZodString;
      checkoutPath: z.ZodString;
      branch: z.ZodString;
      remoteFingerprint: z.ZodString;
    }>,
    Strict<{
      type: z.ZodLiteral<"execute-operation">;
      version: z.ZodNumber;
      requestId: z.ZodString;
      checkoutPath: z.ZodString;
      operation: typeof gitOperationSchema;
    }>,
    Strict<{
      type: z.ZodLiteral<"progress">;
      version: z.ZodNumber;
      requestId: z.ZodString;
      phase: z.ZodLiteral<"running">;
      observedAt: z.ZodString;
    }>,
    Strict<{
      type: z.ZodLiteral<"result">;
      version: z.ZodNumber;
      requestId: z.ZodString;
      outcome: z.ZodEnum<{ ok: "ok"; error: "error" }>;
      value: z.ZodUnknown;
      error: z.ZodNullable<z.ZodString>;
    }>,
    Strict<{
      type: z.ZodLiteral<"query">;
      version: z.ZodNumber;
      requestId: z.ZodString;
    }>,
    Strict<{
      type: z.ZodLiteral<"open-admission">;
      version: z.ZodNumber;
      requestId: z.ZodString;
    }>,
    Strict<{
      type: z.ZodLiteral<"status">;
      version: z.ZodNumber;
      requestId: z.ZodString;
      brokerId: z.ZodString;
      checkouts: z.ZodArray<z.ZodString>;
      activeRequestIds: z.ZodArray<z.ZodString>;
      queuedRequestIds: z.ZodArray<z.ZodString>;
      ambiguousRequestIds: z.ZodArray<z.ZodString>;
      evidenceComplete: z.ZodBoolean;
      recoveryPending: z.ZodBoolean;
      admitsMutations: z.ZodBoolean;
      oldestActiveProgressAt: z.ZodNullable<z.ZodNumber>;
    }>,
    Strict<{
      type: z.ZodLiteral<"heartbeat">;
      version: z.ZodNumber;
      brokerId: z.ZodString;
      observedAt: z.ZodString;
    }>,
  ],
  "type"
> = z.discriminatedUnion("type", [
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
      /** Operation-specific payload, already typed by the operation contract. */
      value: z.unknown(),
      error: z.string().nullable(),
    })
    .strict(),
  z.object({ type: z.literal("query"), version, requestId }).strict(),
  /**
   * A role reporting that it has reconciled what the previous owner left.
   *
   * The broker cannot do this itself: the queue and the durable checkpoint
   * live in the app. So it holds mutations until one role says the checkout
   * has been accounted for.
   */
  z.object({ type: z.literal("open-admission"), version, requestId }).strict(),
  z
    .object({
      type: z.literal("status"),
      version,
      requestId,
      brokerId: z.string().min(1),
      checkouts: z.array(z.string()),
      activeRequestIds: z.array(requestId),
      /** Accepted and waiting for a turn; waiting is not stalling. */
      queuedRequestIds: z.array(requestId),
      /** Requests the previous generation started and never settled. */
      ambiguousRequestIds: z.array(requestId),
      /** False when the previous generation's record could not be read whole. */
      evidenceComplete: z.boolean(),
      /** True until the scheduling role reconciles an inherited generation. */
      recoveryPending: z.boolean(),
      /** False while this owner is holding mutations pending reconciliation. */
      admitsMutations: z.boolean(),
      /**
       * Epoch millis of the least recently advanced active operation, or null
       * when nothing is active. Progress age, not start age: a slow clone that
       * keeps producing output is healthy, and one that stops is not.
       */
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

export type BrokerMessage = z.output<typeof brokerMessageSchema>;
export type RegisterCheckoutMessage = Extract<
  BrokerMessage,
  { type: "register-checkout" }
>;
export type ExecuteOperationMessage = Extract<
  BrokerMessage,
  { type: "execute-operation" }
>;
export type ProgressMessage = Extract<BrokerMessage, { type: "progress" }>;
export type ResultMessage = Extract<BrokerMessage, { type: "result" }>;
export type OpenAdmissionMessage = Extract<
  BrokerMessage,
  { type: "open-admission" }
>;
export type QueryMessage = Extract<BrokerMessage, { type: "query" }>;
export type StatusMessage = Extract<BrokerMessage, { type: "status" }>;
export type HeartbeatMessage = Extract<BrokerMessage, { type: "heartbeat" }>;

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
