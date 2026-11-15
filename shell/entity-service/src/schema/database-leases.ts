import {
  integer,
  sqliteTable,
  text,
  type SQLiteTableWithColumns,
} from "drizzle-orm/sqlite-core";
import type { SqliteIntegerColumn, SqliteTextColumn } from "@brains/db";

type LeaseText<
  TName extends string,
  TNotNull extends boolean,
  TPrimaryKey extends boolean = false,
> = SqliteTextColumn<
  "database_leases",
  TName,
  TNotNull,
  false,
  TPrimaryKey,
  false
>;
type LeaseInteger<TName extends string> = SqliteIntegerColumn<
  "database_leases",
  TName,
  true,
  false,
  false
>;
type DatabaseLeasesTable = SQLiteTableWithColumns<{
  name: "database_leases";
  schema: undefined;
  columns: {
    id: LeaseText<"id", true, true>;
    role: LeaseText<"role", true>;
    command: LeaseText<"command", false>;
    hostname: LeaseText<"hostname", true>;
    pid: LeaseInteger<"pid">;
    startedAt: LeaseInteger<"started_at">;
    heartbeatAt: LeaseInteger<"heartbeat_at">;
    expiresAt: LeaseInteger<"expires_at">;
  };
  dialect: "sqlite";
}>;

/**
 * One row per process using this database file: a running brain, or an
 * offline maintenance command. Each renews its row while it runs and deletes
 * it when it stops cleanly, so a row that expired was left by a crash.
 */
export const databaseLeases: DatabaseLeasesTable = sqliteTable(
  "database_leases",
  {
    id: text("id").primaryKey(),
    role: text("role").notNull(),
    command: text("command"),
    hostname: text("hostname").notNull(),
    pid: integer("pid").notNull(),
    startedAt: integer("started_at").notNull(),
    heartbeatAt: integer("heartbeat_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
);
