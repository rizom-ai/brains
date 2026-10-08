import { Rpc, RpcGroup, Schema } from "@brains/utils/effect/rpc";
import { z } from "@brains/utils/zod";
import { gitOperationSchema } from "./operations";
import type { GitOperation } from "./operations";

// Private wire contracts: declarations adapt authoritative Zod validation.
// No Effect Schema or RPC types cross the Promise-based broker facade.
export interface RegisterCheckoutPayload {
  readonly checkoutPath: string;
  readonly branch: string;
  readonly remoteFingerprint: string;
}
export interface ExecuteOperationPayload {
  readonly operationId: string;
  readonly checkoutPath: string;
  readonly operation: GitOperation;
}
export interface BrokerRpcStatus {
  readonly brokerId: string;
  readonly checkouts: string[];
  readonly activeRequestIds: string[];
  readonly queuedRequestIds: string[];
  readonly ambiguousRequestIds: string[];
  readonly evidenceComplete: boolean;
  readonly recoveryPending: boolean;
  readonly admitsMutations: boolean;
  readonly oldestActiveProgressAt: number | null;
}
export interface BrokerRpcFailure {
  readonly _tag: "BrokerError";
  readonly message: string;
}
export type BrokerRpcEvent =
  | {
      readonly _tag: "Progress";
      readonly phase: "running";
      readonly observedAt: string;
    }
  | {
      readonly _tag: "Result";
      readonly outcome: "ok" | "error";
      readonly value?: unknown;
      readonly error: string | null;
    };

const operationIdSchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);
const registerCheckoutPayloadSchema: z.ZodType<RegisterCheckoutPayload> =
  z.strictObject({
    checkoutPath: z.string().min(1),
    branch: z.string().min(1),
    remoteFingerprint: z.string().min(1),
  });
const executeOperationPayloadSchema: z.ZodType<ExecuteOperationPayload> =
  z.strictObject({
    operationId: operationIdSchema,
    checkoutPath: z.string().min(1),
    operation: gitOperationSchema,
  });
const emptyPayloadSchema = z.strictObject({});
const statusSchema: z.ZodType<BrokerRpcStatus> = z.strictObject({
  brokerId: z.string().min(1),
  checkouts: z.array(z.string()),
  activeRequestIds: z.array(operationIdSchema),
  queuedRequestIds: z.array(operationIdSchema),
  ambiguousRequestIds: z.array(operationIdSchema),
  evidenceComplete: z.boolean(),
  recoveryPending: z.boolean(),
  admitsMutations: z.boolean(),
  oldestActiveProgressAt: z.number().int().nonnegative().nullable(),
});
const failureSchema: z.ZodType<BrokerRpcFailure> = z.strictObject({
  _tag: z.literal("BrokerError"),
  message: z.string().min(1),
});
const eventSchema: z.ZodType<BrokerRpcEvent> = z.discriminatedUnion("_tag", [
  z.strictObject({
    _tag: z.literal("Progress"),
    phase: z.literal("running"),
    observedAt: z.string().min(1).max(64),
  }),
  z.strictObject({
    _tag: z.literal("Result"),
    outcome: z.enum(["ok", "error"]),
    value: z.unknown(),
    error: z.string().nullable(),
  }),
]);

function wireSchema<T>(schema: z.ZodType<T>): Schema.declare<T> {
  return Schema.declare<T>(
    (value): value is T => schema.safeParse(value).success,
  );
}

type StatusRpc<TTag extends string, TPayload> = Rpc.Rpc<
  TTag,
  Schema.declare<TPayload>,
  Schema.declare<BrokerRpcStatus>,
  Schema.declare<BrokerRpcFailure>
>;
type ExecuteRpc = ReturnType<
  typeof Rpc.make<
    "ExecuteOperation",
    Schema.declare<ExecuteOperationPayload>,
    Schema.declare<BrokerRpcEvent>,
    Schema.declare<BrokerRpcFailure>,
    true
  >
>;
export type BrokerRpc =
  | StatusRpc<"RegisterCheckout", RegisterCheckoutPayload>
  | StatusRpc<"QueryStatus", Record<string, never>>
  | StatusRpc<"OpenAdmission", Record<string, never>>
  | ExecuteRpc;

export const BrokerRpcs: RpcGroup.RpcGroup<BrokerRpc> = RpcGroup.make(
  Rpc.make("RegisterCheckout", {
    payload: wireSchema(registerCheckoutPayloadSchema),
    success: wireSchema(statusSchema),
    error: wireSchema(failureSchema),
  }),
  Rpc.make("QueryStatus", {
    payload: wireSchema(emptyPayloadSchema),
    success: wireSchema(statusSchema),
    error: wireSchema(failureSchema),
  }),
  Rpc.make("OpenAdmission", {
    payload: wireSchema(emptyPayloadSchema),
    success: wireSchema(statusSchema),
    error: wireSchema(failureSchema),
  }),
  Rpc.make("ExecuteOperation", {
    payload: wireSchema(executeOperationPayloadSchema),
    success: wireSchema(eventSchema),
    error: wireSchema(failureSchema),
    stream: true,
  }),
);

const rpcIdSchema = z.union([
  z.string().min(1).max(64),
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
]);
const requestFields = {
  _tag: z.literal("Request"),
  id: rpcIdSchema,
  headers: z.array(z.tuple([z.string(), z.string()])),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  sampled: z.boolean().optional(),
};
const requestSchema = z.discriminatedUnion("tag", [
  z.strictObject({
    ...requestFields,
    tag: z.literal("RegisterCheckout"),
    payload: registerCheckoutPayloadSchema,
  }),
  z.strictObject({
    ...requestFields,
    tag: z.literal("ExecuteOperation"),
    payload: executeOperationPayloadSchema,
  }),
  z.strictObject({
    ...requestFields,
    tag: z.literal("QueryStatus"),
    payload: emptyPayloadSchema,
  }),
  z.strictObject({
    ...requestFields,
    tag: z.literal("OpenAdmission"),
    payload: emptyPayloadSchema,
  }),
]);
// Defects are opaque codec values, not operation inputs or native argv.
const causeSchema = z.array(
  z.discriminatedUnion("_tag", [
    z.strictObject({ _tag: z.literal("Fail"), error: failureSchema }),
    z.strictObject({ _tag: z.literal("Die"), defect: z.unknown() }),
    z.strictObject({
      _tag: z.literal("Interrupt"),
      fiberId: z.number().optional(),
    }),
  ]),
);
const exitSchema = z.discriminatedUnion("_tag", [
  z.strictObject({
    _tag: z.literal("Success"),
    value: statusSchema.nullable().optional(),
  }),
  z.strictObject({ _tag: z.literal("Failure"), cause: causeSchema }),
]);
const brokerRpcMessageSchema = z.union([
  requestSchema,
  z.strictObject({ _tag: z.literal("Ack"), requestId: rpcIdSchema }),
  z.strictObject({ _tag: z.literal("Interrupt"), requestId: rpcIdSchema }),
  z.strictObject({ _tag: z.literal("Ping") }),
  z.strictObject({ _tag: z.literal("Pong") }),
  z.strictObject({ _tag: z.literal("Eof") }),
  z.strictObject({
    _tag: z.literal("Chunk"),
    requestId: rpcIdSchema,
    values: z.array(eventSchema).min(1),
  }),
  z.strictObject({
    _tag: z.literal("Exit"),
    requestId: rpcIdSchema,
    exit: exitSchema,
  }),
  z.strictObject({ _tag: z.literal("Defect"), defect: z.unknown() }),
]);

/** Run before any Effect RPC decoding can strip unknown fields. */
export function isBrokerRpcMessage(value: unknown): boolean {
  return brokerRpcMessageSchema.safeParse(value).success;
}
