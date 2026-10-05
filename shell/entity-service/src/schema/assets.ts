import { sql } from "drizzle-orm";
import {
  blob,
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import type {
  SqliteBlobColumn,
  SqliteIntegerColumn,
  SqliteTable,
  SqliteTextColumn,
} from "@brains/db";

type AssetUploadsTable = SqliteTable<
  "asset_uploads",
  {
    uploadId: SqliteTextColumn<"asset_uploads", "upload_id", true, false, true>;
    created: SqliteIntegerColumn<"asset_uploads", "created", true>;
  }
>;

type AssetChunksTable = SqliteTable<
  "asset_chunks",
  {
    uploadId: SqliteTextColumn<"asset_chunks", "upload_id", true>;
    ordinal: SqliteIntegerColumn<"asset_chunks", "ordinal", true>;
    bytes: SqliteBlobColumn<"asset_chunks", "bytes", true>;
  }
>;

type AssetsTable = SqliteTable<
  "assets",
  {
    digest: SqliteTextColumn<"assets", "digest", true, false, true>;
    uploadId: SqliteTextColumn<"assets", "upload_id", true>;
    sizeBytes: SqliteIntegerColumn<"assets", "size_bytes", true>;
    chunkCount: SqliteIntegerColumn<"assets", "chunk_count", true>;
    created: SqliteIntegerColumn<"assets", "created", true>;
  }
>;

/** A staging key: its chunks are durable but unpublished until an asset row names it. */
export const assetUploads: AssetUploadsTable = sqliteTable("asset_uploads", {
  uploadId: text("upload_id").notNull().primaryKey(),
  created: integer("created").notNull(),
});

/** 1 MiB slices of one upload, in ordinal order; the last may be shorter. */
export const assetChunks: AssetChunksTable = sqliteTable(
  "asset_chunks",
  {
    uploadId: text("upload_id")
      .notNull()
      .references(() => assetUploads.uploadId),
    ordinal: integer("ordinal").notNull(),
    bytes: blob("bytes", { mode: "buffer" }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.uploadId, table.ordinal] }),
    ordinalCheck: check(
      "asset_chunks_ordinal_check",
      sql`${table.ordinal} >= 0`,
    ),
    bytesTypeCheck: check(
      "asset_chunks_bytes_type_check",
      sql`typeof(${table.bytes}) = 'blob'`,
    ),
    bytesLengthCheck: check(
      "asset_chunks_bytes_length_check",
      sql`length(${table.bytes}) BETWEEN 1 AND 1048576`,
    ),
  }),
);

/** Published, immutable content-addressed assets. */
export const assets: AssetsTable = sqliteTable(
  "assets",
  {
    digest: text("digest").notNull().primaryKey(),
    uploadId: text("upload_id")
      .notNull()
      .unique()
      .references(() => assetUploads.uploadId),
    sizeBytes: integer("size_bytes").notNull(),
    chunkCount: integer("chunk_count").notNull(),
    created: integer("created").notNull(),
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
    sizeNonnegativeCheck: check(
      "assets_size_nonnegative_check",
      sql`${table.sizeBytes} >= 0`,
    ),
    chunkCountCheck: check(
      "assets_chunk_count_check",
      sql`${table.chunkCount} = (${table.sizeBytes} + 1048575) / 1048576`,
    ),
  }),
);

export type StoredAsset = typeof assets.$inferSelect;
