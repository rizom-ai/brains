import type { ResultSet, TransactionMode } from "@libsql/client";
import type { SqlStatement } from "./client-protocol";

/** Internal lease identity belongs to one transport generation. */
export interface SqlWorkerLease {
  readonly id: string;
  readonly closed: boolean;
  execute(statement: SqlStatement): Promise<ResultSet>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/** Client-facing transport, not a native connection or worker bootstrap.
 * Implementations must snapshot/charge whole backings before queue admission,
 * validate command/reply identities, fence uncertainty, and join owned workers
 * on close. Statement schema validation alone does not establish these bounds.
 */
export interface SqlWorkerTransport {
  readonly closed: boolean;
  execute(statement: SqlStatement): Promise<ResultSet>;
  batch(
    statements: SqlStatement[],
    mode: TransactionMode,
    lease?: string,
  ): Promise<ResultSet[]>;
  migrateProgram(statements: SqlStatement[]): Promise<ResultSet[]>;
  executeMultiple(sql: string, lease?: string): Promise<void>;
  transaction(mode: TransactionMode): Promise<SqlWorkerLease>;
  close(): Promise<void>;
}
