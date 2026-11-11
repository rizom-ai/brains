import { Rpc, RpcGroup, Schema } from "@brains/utils/effect/rpc";
import type { RpcMessage } from "@brains/utils/effect/rpc";
import { z } from "@brains/utils/zod";
import { gitOperationSchema } from "./operations";

// Private wire contracts: the Zod validation is authoritative and the types
// derive from it. No Effect Schema or RPC types cross the Promise-based
// broker facade.
type Strict<Shape extends z.ZodRawShape> = z.ZodObject<Shape, z.core.$strict>;

const operationIdSchema: z.ZodString = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);
const registerCheckoutPayloadSchema: Strict<{
  checkoutPath: z.ZodString;
  branch: z.ZodString;
  remoteFingerprint: z.ZodString;
}> = z.strictObject({
  checkoutPath: z.string().min(1),
  branch: z.string().min(1),
  remoteFingerprint: z.string().min(1),
});
export type RegisterCheckoutPayload = z.output<
  typeof registerCheckoutPayloadSchema
>;
const executeOperationPayloadSchema: Strict<{
  operationId: z.ZodString;
  checkoutPath: z.ZodString;
  operation: typeof gitOperationSchema;
}> = z.strictObject({
  operationId: operationIdSchema,
  checkoutPath: z.string().min(1),
  operation: gitOperationSchema,
});
export type ExecuteOperationPayload = z.output<
  typeof executeOperationPayloadSchema
>;
const emptyPayloadSchema = z.strictObject({});
const statusSchema: Strict<{
  brokerId: z.ZodString;
  checkouts: z.ZodArray<z.ZodString>;
  ambiguousRequestIds: z.ZodArray<z.ZodString>;
  evidenceComplete: z.ZodBoolean;
  recoveryPending: z.ZodBoolean;
  admitsMutations: z.ZodBoolean;
}> = z.strictObject({
  brokerId: z.string().min(1),
  checkouts: z.array(z.string()),
  ambiguousRequestIds: z.array(operationIdSchema),
  evidenceComplete: z.boolean(),
  recoveryPending: z.boolean(),
  admitsMutations: z.boolean(),
});
export type BrokerRpcStatus = z.output<typeof statusSchema>;
const failureSchema: Strict<{
  _tag: z.ZodLiteral<"BrokerError">;
  message: z.ZodString;
}> = z.strictObject({
  _tag: z.literal("BrokerError"),
  message: z.string().min(1),
});
export type BrokerRpcFailure = z.output<typeof failureSchema>;
const eventSchema: z.ZodDiscriminatedUnion<
  [
    Strict<{
      _tag: z.ZodLiteral<"Progress">;
      phase: z.ZodLiteral<"running">;
      observedAt: z.ZodString;
    }>,
    Strict<{
      _tag: z.ZodLiteral<"Result">;
      outcome: z.ZodEnum<{ ok: "ok"; error: "error" }>;
      value: z.ZodUnknown;
      error: z.ZodNullable<z.ZodString>;
    }>,
  ]
> = z.discriminatedUnion("_tag", [
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
export type BrokerRpcEvent = z.output<typeof eventSchema>;

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
const clientMessageSchema = z.union([
  requestSchema,
  z.strictObject({ _tag: z.literal("Ack"), requestId: rpcIdSchema }),
  z.strictObject({ _tag: z.literal("Interrupt"), requestId: rpcIdSchema }),
  z.strictObject({ _tag: z.literal("Ping") }),
  z.strictObject({ _tag: z.literal("Eof") }),
]);
const brokerRpcMessageSchema = z.union([
  clientMessageSchema,
  z.strictObject({ _tag: z.literal("Pong") }),
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

/** Reject server-to-client messages on the request side too. */
export function parseBrokerRpcRequest(
  value: unknown,
): RpcMessage.FromClientEncoded {
  const message = clientMessageSchema.parse(value);
  if (message._tag !== "Request") return message;
  const { traceId, spanId, sampled, ...request } = message;
  return {
    ...request,
    ...(traceId === undefined ? {} : { traceId }),
    ...(spanId === undefined ? {} : { spanId }),
    ...(sampled === undefined ? {} : { sampled }),
  };
}
