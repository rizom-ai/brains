import type {
  InStatement,
  ResultSet,
  Transaction,
  TransactionMode,
} from "@libsql/client";

/** Internal worker backend; its owner supplies serialization and lifecycle fences. */
export type NativeTransaction = Pick<
  Transaction,
  "execute" | "batch" | "executeMultiple" | "commit" | "rollback"
> & {
  savepoint: (
    action: "begin" | "rollback" | "release",
    id: number,
  ) => Promise<void>;
};

export interface OwnerBackend {
  inTransaction: () => boolean;
  execute: (statement: InStatement) => Promise<ResultSet>;
  executeMultiple: (sql: string) => Promise<void>;
  transaction: (mode: TransactionMode) => Promise<NativeTransaction>;
  setForeignKeys: (enabled: boolean) => Promise<void>;
  foreignKeysEnabled: () => Promise<boolean>;
  close: () => Promise<void>;
}
