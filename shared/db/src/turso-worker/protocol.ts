// Execution worker protocol; metadata and operation-specific validation.
import { z } from "@brains/utils/zod";
import { MAX_COMMANDS, MAX_QUEUED_COMMAND_BYTES } from "./command-admission";
import { MessagePort } from "node:worker_threads";
import {
  executeCommandSchema,
  batchCommandSchema,
  migrateCommandSchema,
  scriptCommandSchema,
} from "./sql-command";
import { uploadGrantSchema, uploadResultSchema } from "./upload-protocol";
import { readCommandSchema } from "./read-protocol";
import { savepointCommandSchema } from "./savepoint-protocol";
import { errorSchema } from "./error-protocol";
import { budgetGrantSchema } from "./budget-protocol";
import { blobPlanSchema, blobPlanBytes } from "./blob-protocol";
import {
  binaryCommandSchema,
  boundStatementSchema,
  boundStatementBytes,
  claimSchema,
  isBinaryCleanup,
  STAGE_SLOTS,
} from "./binary-protocol";

import {
  type argumentSchema,
  statementSchema,
  MAX_SQL_MESSAGE_BYTES,
  MAX_SQL_MIGRATION_STATEMENTS,
} from "./client-protocol";

export const MAX_MESSAGE_BYTES: number = MAX_SQL_MESSAGE_BYTES;
export const MAX_PENDING_BYTES: number = MAX_QUEUED_COMMAND_BYTES;
export const MAX_IN_FLIGHT: number = MAX_COMMANDS;
export const MAX_MIGRATION_BYTES: number = 256 * 1024;
export const MAX_MIGRATION_STATEMENTS: number = MAX_SQL_MIGRATION_STATEMENTS;
export const MAX_MIGRATION_PLANS: number = 16;
export const migrationTokenSchema: z.ZodObject<{
  generation: z.ZodString;
  id: z.ZodNumber;
}> = z.strictObject({
  generation: z.string().uuid(),
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
export type MigrationToken = z.output<typeof migrationTokenSchema>;

const migrationCommandSchema: z.ZodDiscriminatedUnion<
  [
    z.ZodObject<{
      action: z.ZodLiteral<"reserve">;
      bytes: z.ZodNumber;
      count: z.ZodNumber;
    }>,
    z.ZodObject<{
      action: z.ZodLiteral<"append">;
      token: typeof migrationTokenSchema;
      offset: z.ZodNumber;
      statements: z.ZodArray<typeof statementSchema>;
    }>,
    z.ZodObject<{
      action: z.ZodLiteral<"run">;
      token: typeof migrationTokenSchema;
      count: z.ZodNumber;
    }>,
    z.ZodObject<{
      action: z.ZodLiteral<"discard">;
      token: typeof migrationTokenSchema;
    }>,
  ],
  "action"
> = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("reserve"),
    bytes: z.number().int().min(0).max(MAX_MIGRATION_BYTES),
    count: z.number().int().min(0).max(MAX_MIGRATION_STATEMENTS),
  }),
  z.strictObject({
    action: z.literal("append"),
    token: migrationTokenSchema,
    offset: z.number().int().min(0).max(MAX_MIGRATION_STATEMENTS),
    statements: z.array(statementSchema).min(1).max(16),
  }),
  z.strictObject({
    action: z.literal("run"),
    token: migrationTokenSchema,
    count: z.number().int().min(0).max(MAX_MIGRATION_STATEMENTS),
  }),
  z.strictObject({ action: z.literal("discard"), token: migrationTokenSchema }),
]);
export type MigrationCommand = z.output<typeof migrationCommandSchema>;

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
      "cancelTransfer",
      { id: z.ZodString; direction: typeof uploadGrantSchema.shape.direction }
    >,
    Operation<"read", { command: typeof readCommandSchema }>,
    Operation<
      "openRead",
      { grant: typeof uploadGrantSchema; port: z.ZodCustom<MessagePort> }
    >,
    Operation<
      "openUpload",
      { grant: typeof uploadGrantSchema; port: z.ZodCustom<MessagePort> }
    >,
    Operation<
      "verifyBlob",
      { plan: typeof blobPlanSchema; lease: z.ZodOptional<z.ZodString> }
    >,
    Operation<"savepoint", { command: typeof savepointCommandSchema }>,
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
    Operation<"migration", { command: typeof migrationCommandSchema }>,
    Operation<
      "executeBound",
      { lease: z.ZodString; statement: typeof boundStatementSchema }
    >,
    Operation<"gate", { state: z.ZodCustom<SharedArrayBuffer> }>,
  ],
  "op"
> = z.discriminatedUnion("op", [
  executeCommandSchema,
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
    op: z.literal("cancelTransfer"),
    id: z.string().uuid(),
    direction: uploadGrantSchema.shape.direction,
  }),
  z.strictObject({ op: z.literal("read"), command: readCommandSchema }),
  z.strictObject({
    op: z.literal("openRead"),
    grant: uploadGrantSchema,
    port: z.instanceof(MessagePort),
  }),
  z.strictObject({
    op: z.literal("openUpload"),
    grant: uploadGrantSchema,
    port: z.instanceof(MessagePort),
  }),
  z.strictObject({
    op: z.literal("verifyBlob"),
    plan: blobPlanSchema,
    lease: z.string().uuid().optional(),
  }),
  z.strictObject({
    op: z.literal("savepoint"),
    command: savepointCommandSchema,
  }),
  batchCommandSchema,
  migrateCommandSchema,
  scriptCommandSchema,
  z.strictObject({ op: z.literal("binary"), command: binaryCommandSchema }),
  z.strictObject({
    op: z.literal("migration"),
    command: migrationCommandSchema,
  }),
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
  budget: z.ZodOptional<typeof budgetGrantSchema>;
}> = z.strictObject({
  id: z.number().int().positive(),
  generation: z.string().uuid(),
  command: commandSchema,
  budget: budgetGrantSchema.optional(),
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
    Reply<
      "read-closed",
      { id: z.ZodString; result: typeof uploadResultSchema }
    >,
    Reply<
      "upload-closed",
      { id: z.ZodString; result: typeof uploadResultSchema }
    >,
    Reply<"budget-release", { id: z.ZodNumber }>,
    Reply<"gate-entered", { id: z.ZodNumber }>,
    Reply<"result", { id: z.ZodNumber; value: z.ZodUnknown }>,
    Reply<"error", { id: z.ZodNumber; error: typeof errorSchema }>,
    Reply<"owner-failed", { id: z.ZodNumber; error: typeof errorSchema }>,
  ],
  "kind"
> = z.discriminatedUnion("kind", [
  placementSchema.extend({ kind: z.literal("ready") }),
  placementSchema.extend({
    kind: z.literal("read-closed"),
    id: z.string().uuid(),
    result: uploadResultSchema,
  }),
  placementSchema.extend({
    kind: z.literal("upload-closed"),
    id: z.string().uuid(),
    result: uploadResultSchema,
  }),
  placementSchema.extend({
    kind: z.literal("budget-release"),
    id: z.number().int().positive(),
  }),
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

export type SqlStatement = z.output<typeof statementSchema>;
export type WorkerCommand = z.output<typeof commandSchema>;
export type WorkerRequest = z.output<typeof requestSchema>;
export type WorkerPlacement = z.output<typeof placementSchema>;
export type WorkerReply = z.output<typeof replySchema>;

export function parseCommand(input: unknown): WorkerCommand {
  return commandSchema.parse(input);
}
export function parseRequest(input: unknown): WorkerRequest {
  return requestSchema.parse(input);
}
export function parseReply(input: unknown): WorkerReply {
  return replySchema.parse(input);
}
export function isControlCommand(command: WorkerCommand): boolean {
  return (
    command.op === "close" ||
    command.op === "finish" ||
    command.op === "savepoint"
  );
}
export function isCleanupCommand(command: WorkerCommand): boolean {
  return (
    command.op === "cancelTransfer" ||
    (command.op === "binary" && isBinaryCleanup(command.command)) ||
    (command.op === "read" &&
      (command.command.action === "closeScope" ||
        command.command.action === "discard")) ||
    (command.op === "migration" && command.command.action === "discard")
  );
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

export function snapshotCommand(command: WorkerCommand): WorkerCommand {
  if (command.op === "migration" && command.command.action === "append")
    return {
      ...command,
      command: {
        ...command.command,
        statements: command.command.statements.map(snapshotStatement),
      },
    };
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

export function snapshotStatement(statement: SqlStatement): SqlStatement {
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

export function commandBytes(command: WorkerCommand): number {
  if (
    command.op === "openUpload" ||
    command.op === "openRead" ||
    command.op === "cancelTransfer"
  )
    return 512;
  if (command.op === "read")
    return command.command.action === "allocate"
      ? blobPlanBytes(command.command.plan)
      : 512;
  if (command.op === "verifyBlob") return blobPlanBytes(command.plan);
  if (command.op === "migration") {
    const bytes =
      command.command.action === "append"
        ? command.command.statements.reduce(
            (sum, statement) => sum + statementBytes(statement),
            512,
          )
        : 512;
    if (bytes > MAX_MESSAGE_BYTES)
      throw new Error("Proof driver command byte limit exceeded");
    return bytes;
  }
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

export function statementBytes(statement: SqlStatement): number {
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
