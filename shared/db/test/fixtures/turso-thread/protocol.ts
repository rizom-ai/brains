// Isolated driver proof. Not exported by @brains/db or used by runtime callers.
import { z } from "@brains/utils/zod";
import {
  binaryCommandSchema,
  boundStatementSchema,
  boundStatementBytes,
  claimSchema,
  isBinaryCleanup,
  STAGE_SLOTS,
} from "./binary-protocol";

export const MAX_MESSAGE_BYTES: number = 64 * 1024;
export const MAX_PENDING_BYTES: number = 256 * 1024;
export const MAX_IN_FLIGHT: number = 16;

const argumentSchema: z.ZodUnion<
  [
    z.ZodNull,
    z.ZodString,
    z.ZodNumber,
    z.ZodBigInt,
    z.ZodBoolean,
    z.ZodDate,
    z.ZodCustom<ArrayBuffer>,
    z.ZodCustom<Uint8Array>,
  ]
> = z.union([
  z.null(),
  z.string().max(MAX_MESSAGE_BYTES),
  z.number(),
  z.bigint(),
  z.boolean(),
  z.date(),
  z
    .instanceof(ArrayBuffer)
    .refine((value) => value.byteLength <= MAX_MESSAGE_BYTES),
  z
    .instanceof(Uint8Array)
    .refine((value) => value.byteLength <= MAX_MESSAGE_BYTES),
]);
const statementSchema: z.ZodObject<{
  sql: z.ZodString;
  args: z.ZodOptional<
    z.ZodUnion<
      readonly [
        z.ZodArray<typeof argumentSchema>,
        z.ZodRecord<z.ZodString, typeof argumentSchema>,
      ]
    >
  >;
}> = z.strictObject({
  sql: z.string().min(1).max(MAX_MESSAGE_BYTES),
  args: z
    .union([
      z.array(argumentSchema).max(256),
      z
        .record(z.string().max(128), argumentSchema)
        .refine((args) => Object.keys(args).length <= 256),
    ])
    .optional(),
});
type Operation<
  Name extends string,
  Shape extends z.ZodRawShape = Record<never, never>,
> = z.ZodObject<{ op: z.ZodLiteral<Name> } & Shape>;
const commandSchema: z.ZodDiscriminatedUnion<
  [
    Operation<
      "execute",
      { statement: typeof statementSchema; lease: z.ZodOptional<z.ZodString> }
    >,
    Operation<
      "begin",
      {
        mode: z.ZodEnum<{ write: "write"; read: "read"; deferred: "deferred" }>;
        claims: z.ZodOptional<z.ZodArray<typeof claimSchema>>;
      }
    >,
    Operation<
      "finish",
      {
        lease: z.ZodString;
        action: z.ZodEnum<{ commit: "commit"; rollback: "rollback" }>;
      }
    >,
    Operation<"close">,
    Operation<
      "batch",
      {
        statements: z.ZodArray<typeof statementSchema>;
        mode: z.ZodEnum<{ write: "write"; read: "read"; deferred: "deferred" }>;
        lease: z.ZodOptional<z.ZodString>;
      }
    >,
    Operation<"migrate", { statements: z.ZodArray<typeof statementSchema> }>,
    Operation<
      "script",
      { sql: z.ZodString; lease: z.ZodOptional<z.ZodString> }
    >,
    Operation<"binary", { command: typeof binaryCommandSchema }>,
    Operation<
      "executeBound",
      { lease: z.ZodString; statement: typeof boundStatementSchema }
    >,
    Operation<"gate", { state: z.ZodCustom<SharedArrayBuffer> }>,
  ],
  "op"
> = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("execute"),
    statement: statementSchema,
    lease: z.string().uuid().optional(),
  }),
  z.strictObject({
    op: z.literal("begin"),
    mode: z.enum(["write", "read", "deferred"]),
    claims: z.array(claimSchema).max(STAGE_SLOTS).optional(),
  }),
  z.strictObject({
    op: z.literal("finish"),
    lease: z.string().uuid(),
    action: z.enum(["commit", "rollback"]),
  }),
  z.strictObject({ op: z.literal("close") }),
  z.strictObject({
    op: z.literal("batch"),
    statements: z.array(statementSchema).max(16),
    mode: z.enum(["write", "read", "deferred"]),
    lease: z.string().uuid().optional(),
  }),
  z.strictObject({
    op: z.literal("migrate"),
    statements: z.array(statementSchema).max(16),
  }),
  z.strictObject({
    op: z.literal("script"),
    sql: z.string().max(MAX_MESSAGE_BYTES),
    lease: z.string().uuid().optional(),
  }),
  z.strictObject({ op: z.literal("binary"), command: binaryCommandSchema }),
  z.strictObject({
    op: z.literal("executeBound"),
    lease: z.string().uuid(),
    statement: boundStatementSchema,
  }),
  // Test-only deterministic gate: never a production driver command.
  z.strictObject({
    op: z.literal("gate"),
    state: z
      .instanceof(SharedArrayBuffer)
      .refine((value) => value.byteLength === 4),
  }),
]);
const requestSchema: z.ZodObject<{
  id: z.ZodNumber;
  generation: z.ZodString;
  command: typeof commandSchema;
}> = z.strictObject({
  id: z.number().int().positive(),
  generation: z.string().uuid(),
  command: commandSchema,
});
const rowValueSchema: z.ZodUnion<
  [z.ZodNull, z.ZodString, z.ZodNumber, z.ZodBigInt, z.ZodCustom<ArrayBuffer>]
> = z.union([
  z.null(),
  z.string(),
  z.number(),
  z.bigint(),
  z.instanceof(ArrayBuffer),
]);
const resultSchema: z.ZodObject<{
  columns: z.ZodArray<z.ZodString>;
  columnTypes: z.ZodArray<z.ZodString>;
  rows: z.ZodArray<z.ZodArray<typeof rowValueSchema>>;
  rowsAffected: z.ZodNumber;
  lastInsertRowid: z.ZodOptional<z.ZodBigInt>;
}> = z.strictObject({
  columns: z.array(z.string()),
  columnTypes: z.array(z.string()),
  rows: z.array(z.array(rowValueSchema)),
  rowsAffected: z.number().int().nonnegative(),
  lastInsertRowid: z.bigint().optional(),
});
const errorSchema: z.ZodObject<{
  name: z.ZodString;
  message: z.ZodString;
  code: z.ZodOptional<z.ZodString>;
}> = z.strictObject({
  name: z.string(),
  message: z.string(),
  code: z.string().optional(),
});
const placementSchema: z.ZodObject<{
  generation: z.ZodString;
  threadId: z.ZodNumber;
  pid: z.ZodNumber;
}> = z.strictObject({
  generation: z.string().uuid(),
  threadId: z.number().int().positive(),
  pid: z.number().int().positive(),
});
type Reply<
  Name extends string,
  Shape extends z.ZodRawShape = Record<never, never>,
> = z.ZodObject<
  typeof placementSchema.shape & { kind: z.ZodLiteral<Name> } & Shape
>;
const replySchema: z.ZodDiscriminatedUnion<
  [
    Reply<"ready">,
    Reply<"gate-entered", { id: z.ZodNumber }>,
    Reply<"result", { id: z.ZodNumber; value: z.ZodUnknown }>,
    Reply<"error", { id: z.ZodNumber; error: typeof errorSchema }>,
    Reply<"owner-failed", { id: z.ZodNumber; error: typeof errorSchema }>,
  ],
  "kind"
> = z.discriminatedUnion("kind", [
  placementSchema.extend({ kind: z.literal("ready") }),
  placementSchema.extend({
    kind: z.literal("gate-entered"),
    id: z.number().int().positive(),
  }),
  placementSchema.extend({
    kind: z.literal("result"),
    id: z.number().int().positive(),
    value: z.unknown(),
  }),
  placementSchema.extend({
    kind: z.literal("error"),
    id: z.number().int().positive(),
    error: errorSchema,
  }),
  placementSchema.extend({
    kind: z.literal("owner-failed"),
    id: z.number().int().positive(),
    error: errorSchema,
  }),
]);
const bootSchema: z.ZodObject<{ url: z.ZodString; generation: z.ZodString }> =
  z.strictObject({
    url: z.string().startsWith("file:"),
    generation: z.string().uuid(),
  });

export type ProofStatement = z.output<typeof statementSchema>;
export type ProofCommand = z.output<typeof commandSchema>;
export type ProofRequest = z.output<typeof requestSchema>;
export type ProofResult = z.output<typeof resultSchema>;
export type ProofError = z.output<typeof errorSchema>;
export type ProofPlacement = z.output<typeof placementSchema>;
export type ProofReply = z.output<typeof replySchema>;
export type ProofBoot = z.output<typeof bootSchema>;
export type ProofRowValue = z.output<typeof rowValueSchema>;

export function parseBoot(input: unknown): ProofBoot {
  return bootSchema.parse(input);
}
export function parseCommand(input: unknown): ProofCommand {
  return commandSchema.parse(input);
}
export function parseRequest(input: unknown): ProofRequest {
  return requestSchema.parse(input);
}
export function parseReply(input: unknown): ProofReply {
  return replySchema.parse(input);
}
export function parseResult(input: unknown): ProofResult {
  return resultSchema.parse(input);
}
export function parseResults(input: unknown): ProofResult[] {
  return z.array(resultSchema).max(16).parse(input);
}
export function parseStatement(input: unknown): ProofStatement {
  return statementSchema.parse(input);
}
export function isCleanupCommand(command: ProofCommand): boolean {
  return command.op === "binary" && isBinaryCleanup(command.command);
}
export function parseLease(input: unknown): string {
  return z.string().uuid().parse(input);
}

function valueBytes(value: z.output<typeof argumentSchema>): number {
  if (typeof value === "string") return Buffer.byteLength(value);
  if (value instanceof ArrayBuffer || value instanceof Uint8Array)
    return value.byteLength;
  if (typeof value === "bigint") {
    if (value < -9223372036854775808n || value > 9223372036854775807n)
      throw new Error("Integer outside SQLite int64 range");
  }
  return 8;
}

export function snapshotCommand(command: ProofCommand): ProofCommand {
  if (command.op === "binary" && command.command.action === "append")
    return {
      ...command,
      command: { ...command.command, bytes: command.command.bytes.slice(0) },
    };
  if (command.op === "executeBound")
    return {
      ...command,
      statement: {
        ...command.statement,
        args: command.statement.args.map((arg) =>
          arg.kind === "scalar" && arg.value instanceof Date
            ? { ...arg, value: new Date(arg.value.valueOf()) }
            : arg,
        ),
      },
    };
  if (command.op === "batch" || command.op === "migrate")
    return {
      ...command,
      statements: command.statements.map(snapshotStatement),
    };
  if (command.op === "execute")
    return { ...command, statement: snapshotStatement(command.statement) };
  return command;
}

function snapshotStatement(statement: ProofStatement): ProofStatement {
  if (statement.args === undefined) return statement;
  const args = statement.args;
  const copy = (
    value: z.output<typeof argumentSchema>,
  ): z.output<typeof argumentSchema> => {
    if (value instanceof Uint8Array) return Uint8Array.from(value);
    if (value instanceof ArrayBuffer) return value.slice(0);
    if (value instanceof Date) return new Date(value.valueOf());
    return value;
  };
  // A tiny view may have a huge or pooled backing store. Snapshot only its
  // bounded visible bytes, not that backing store, before structured cloning.
  return {
    ...statement,
    args: Array.isArray(args)
      ? args.map(copy)
      : Object.fromEntries(
          Object.entries(args).map(([key, value]) => [key, copy(value)]),
        ),
  };
}

export function commandBytes(command: ProofCommand): number {
  if (command.op === "binary")
    return command.command.action === "append"
      ? command.command.bytes.byteLength + 512
      : 512;
  if (command.op === "executeBound") {
    const size = boundStatementBytes(command.statement);
    if (size > MAX_MESSAGE_BYTES)
      throw new Error("Proof driver command byte limit exceeded");
    return size;
  }
  if (command.op === "begin") return 256 + (command.claims?.length ?? 0) * 256;
  if (command.op === "script") {
    const bytes = 256 + Buffer.byteLength(command.sql);
    if (bytes > MAX_MESSAGE_BYTES)
      throw new Error("Proof driver command byte limit exceeded");
    return bytes;
  }
  if (command.op === "batch" || command.op === "migrate") {
    const bytes = command.statements.reduce(
      (total, statement) => total + statementBytes(statement),
      256,
    );
    if (bytes > MAX_MESSAGE_BYTES)
      throw new Error("Proof driver command byte limit exceeded");
    return bytes;
  }
  if (command.op !== "execute") return 256;
  return statementBytes(command.statement);
}

function statementBytes(statement: ProofStatement): number {
  const args = statement.args;
  let bytes = 256 + Buffer.byteLength(statement.sql);
  if (Array.isArray(args)) for (const value of args) bytes += valueBytes(value);
  else if (args)
    for (const [key, value] of Object.entries(args))
      bytes += Buffer.byteLength(key) + valueBytes(value);
  if (bytes > MAX_MESSAGE_BYTES)
    throw new Error("Proof driver command byte limit exceeded");
  return bytes;
}

export function serializeError(error: unknown): ProofError {
  if (!(error instanceof Error))
    return { name: "Error", message: String(error) };
  const code =
    "code" in error && typeof error.code === "string" ? error.code : undefined;
  return {
    name: error.name,
    message: error.message,
    ...(code !== undefined && { code }),
  };
}
