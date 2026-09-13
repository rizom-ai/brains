import { createAssetRef } from "@brains/assets";
import type { BinaryPublication } from "@brains/db/binary-publication";
import { sql } from "drizzle-orm";
import { assets } from "./schema/assets";
import {
  AssetIntegrityError,
  type OwnedAssetPublication,
} from "./sqlite-asset-repository";

/** Asset-specific SQL stays in the service; the database owns native bindings. */
export function createOwnedAssetPublication(
  binary: BinaryPublication,
): OwnedAssetPublication {
  const record = Object.freeze({
    ref: createAssetRef(binary.facts.sha256),
    digest: binary.facts.sha256,
    sizeBytes: binary.facts.sizeBytes,
  });
  return {
    record,
    run: <T>(operation: () => Promise<T>): Promise<T> => binary.run(operation),
    bind: async (transaction, createdAt): Promise<void> => {
      await binary.executeBound(
        transaction,
        transaction
          .insert(assets)
          .values({
            digest: record.digest,
            bytes: sql`${sql.placeholder("asset")}`,
            sizeBytes: record.sizeBytes,
            created: createdAt,
          })
          .onConflictDoNothing(),
        "asset",
      );
      const stored = await binary.verifyBlob(transaction, {
        table: "assets",
        column: "bytes",
        key: [{ column: "digest", value: record.digest }],
        maxBytes: record.sizeBytes,
        expectedSize: record.sizeBytes,
      });
      if (
        stored.sha256 !== record.digest ||
        stored.sizeBytes !== record.sizeBytes
      )
        throw new AssetIntegrityError(
          record.ref,
          "native publication digest or size does not match its receipt",
        );
    },
  };
}
