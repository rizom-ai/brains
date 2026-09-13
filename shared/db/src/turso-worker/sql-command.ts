import { z } from "@brains/utils/zod";
import type { InStatement, ResultSet } from "@libsql/client";
import {
  statementSchema,
  MAX_SQL_MESSAGE_BYTES,
  MAX_SQL_BATCH_STATEMENTS,
  type SqlStatement,
} from "./client-protocol";
import type { ExecutionOwner, OwnedTransaction } from "./ownership";

export const executeCommandSchema: z.ZodObject<{
  op: z.ZodLiteral<"execute">;
  statement: typeof statementSchema;
  lease: z.ZodOptional<z.ZodString>;
}> = z.strictObject({
  op: z.literal("execute"),
  statement: statementSchema,
  lease: z.string().uuid().optional(),
});
export const batchCommandSchema: z.ZodObject<{
  op: z.ZodLiteral<"batch">;
  statements: z.ZodArray<typeof statementSchema>;
  mode: z.ZodEnum<{ write: "write"; read: "read"; deferred: "deferred" }>;
  lease: z.ZodOptional<z.ZodString>;
}> = z.strictObject({
  op: z.literal("batch"),
  statements: z.array(statementSchema).max(MAX_SQL_BATCH_STATEMENTS),
  mode: z.enum(["write", "read", "deferred"]),
  lease: z.string().uuid().optional(),
});
export const migrateCommandSchema: z.ZodObject<{
  op: z.ZodLiteral<"migrate">;
  statements: z.ZodArray<typeof statementSchema>;
}> = z.strictObject({
  op: z.literal("migrate"),
  statements: z.array(statementSchema).max(MAX_SQL_BATCH_STATEMENTS),
});
export const scriptCommandSchema: z.ZodObject<{
  op: z.ZodLiteral<"script">;
  sql: z.ZodString;
  lease: z.ZodOptional<z.ZodString>;
}> = z.strictObject({
  op: z.literal("script"),
  sql: z.string().max(MAX_SQL_MESSAGE_BYTES),
  lease: z.string().uuid().optional(),
});
export type SqlCommand = z.output<
  | typeof executeCommandSchema
  | typeof batchCommandSchema
  | typeof migrateCommandSchema
  | typeof scriptCommandSchema
>;
export type SqlCommandResult =
  | { kind: "result"; result: ResultSet }
  | { kind: "results"; results: ResultSet[] }
  | { kind: "void" };
function statement({ sql, args }: SqlStatement): InStatement {
  return { sql, ...(args !== undefined && { args }) };
}

/** Worker-local dispatch after command validation/admission. Raw results still
 * require bounded encoding before any reply; this function never posts messages.
 * Lease lookup must reject foreign/finished identities, never fall back to root.
 */
export async function executeSqlCommand(
  owner: ExecutionOwner,
  getLease: (id: string) => OwnedTransaction,
  command: SqlCommand,
): Promise<SqlCommandResult> {
  owner.assertHealthy();
  switch (command.op) {
    case "execute": {
      const executor =
        command.lease === undefined ? owner : getLease(command.lease);
      return {
        kind: "result",
        result: await executor.execute(statement(command.statement)),
      };
    }
    case "batch": {
      const statements = command.statements.map(statement);
      return {
        kind: "results",
        results:
          command.lease === undefined
            ? await owner.batch(statements, command.mode)
            : await getLease(command.lease).batch(statements),
      };
    }
    case "migrate":
      return {
        kind: "results",
        results: await owner.migrate(command.statements.map(statement)),
      };
    case "script":
      await (
        command.lease === undefined ? owner : getLease(command.lease)
      ).executeMultiple(command.sql);
      return { kind: "void" };
  }
}
