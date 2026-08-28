import { sql } from "drizzle-orm";
import {
  blob,
  check,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import type {
  SqliteBlobColumn,
  SqliteIntegerColumn,
  SqliteTable,
  SqliteTextColumn,
} from "@brains/db";

type AssetsTable = SqliteTable<
  "assets",
  {
    digest: SqliteTextColumn<"assets", "digest", true, false, true>;
    bytes: SqliteBlobColumn<"assets", "bytes", true>;
    sizeBytes: SqliteIntegerColumn<"assets", "size_bytes", true>;
    created: SqliteIntegerColumn<"assets", "created", true, true, true>;
  }
>;

/** Immutable content-addressed bytes stored beside their entity references. */
export const assets: AssetsTable = sqliteTable(
  "assets",
  {
    digest: text("digest").notNull().primaryKey(),
    bytes: blob("bytes", { mode: "buffer" }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    created: integer("created")
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => ({
    digestLengthCheck: check(
      "assets_digest_length_check",
      sql`length(${table.digest}) = 64`,
    ),
    digestAlphabetCheck: check(
      "assets_digest_alphabet_check",
      sql`${table.digest} NOT GLOB '*[^0-9a-f]*'`,
    ),
    bytesTypeCheck: check(
      "assets_bytes_type_check",
      sql`typeof(${table.bytes}) = 'blob'`,
    ),
    sizeNonnegativeCheck: check(
      "assets_size_nonnegative_check",
      sql`${table.sizeBytes} >= 0`,
    ),
    sizeMatchesBytesCheck: check(
      "assets_size_matches_bytes_check",
      sql`length(${table.bytes}) = ${table.sizeBytes}`,
    ),
  }),
);

export type InsertAsset = typeof assets.$inferInsert;
export type StoredAsset = typeof assets.$inferSelect;
