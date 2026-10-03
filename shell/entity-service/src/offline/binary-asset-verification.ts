import {
  ASSET_REF_PREFIX,
  parseAssetRef,
  type AssetRef,
  type AssetVerification,
} from "@brains/assets";
import { z } from "@brains/utils/zod";
import {
  AssetIntegrityError,
  AssetNotFoundError,
  SqliteAssetRepository,
} from "../sqlite-asset-repository";
import {
  readBinaryAssetInventory,
  type OfflineEntityConnection,
} from "./binary-asset-inventory";

/** How one asset-backed row's reference stands. */
export interface AssetRowCheck {
  id: string;
  ref: AssetRef;
  status: "valid" | "missing" | "corrupt" | "size-mismatch";
  detail?: string;
}

/** Every asset-backed row checked, and what migration should have removed. */
export interface AssetBackedVerification {
  rows: AssetRowCheck[];
  /** Rows still storing inline content. */
  inlineRows: number;
  /** Rows awaiting their bytes that still hold the old 1x1 placeholder. */
  placeholderRows: number;
  /** Full-text rows the type still has; asset-backed types keep none. */
  ftsRows: number;
}

const referenceRowSchema = z.object({
  id: z.string(),
  content: z.string(),
  metadata: z.string(),
});
const recordedSizeSchema = z.object({ sizeBytes: z.number() }).partial();

/**
 * Check every asset-backed row offline: its reference resolves to one
 * published header whose streamed chunks match the digest and size, and the
 * row's recorded size agrees. Each distinct asset is read once.
 * `placeholder` is the type's old pending payload, counted as left to clear.
 */
export async function verifyAssetBackedRows(
  connection: OfflineEntityConnection,
  entityType: string,
  placeholder?: string,
): Promise<AssetBackedVerification> {
  const repository = new SqliteAssetRepository(connection.db);
  const inventory = await readBinaryAssetInventory(
    connection.client,
    entityType,
    placeholder,
  );
  const result = await connection.client.execute({
    sql: "SELECT id, content, metadata FROM entities WHERE entityType = ? AND content LIKE ? ORDER BY id",
    args: [entityType, `${ASSET_REF_PREFIX}%`],
  });
  const verified = new Map<AssetRef, Promise<AssetCheck>>();
  const rows: AssetRowCheck[] = [];
  for (const raw of result.rows) {
    const row = referenceRowSchema.parse(raw);
    const ref = parseAssetRef(row.content);
    const check = verified.get(ref) ?? checkAsset(repository, ref);
    verified.set(ref, check);
    const asset = await check;
    const recorded = recordedSizeSchema.parse(JSON.parse(row.metadata));
    rows.push(rowCheck(row.id, ref, asset, recorded.sizeBytes));
  }
  return {
    rows,
    inlineRows: inventory.inlineIds.length,
    placeholderRows: inventory.placeholderIds.length,
    ftsRows: inventory.ftsRows,
  };
}

type AssetCheck =
  | { status: "verified"; verification: AssetVerification }
  | { status: "missing" }
  | { status: "corrupt"; detail: string };

async function checkAsset(
  repository: SqliteAssetRepository,
  ref: AssetRef,
): Promise<AssetCheck> {
  try {
    return { status: "verified", verification: await repository.verify(ref) };
  } catch (error) {
    if (error instanceof AssetNotFoundError) return { status: "missing" };
    if (error instanceof AssetIntegrityError) {
      return { status: "corrupt", detail: error.message };
    }
    throw error;
  }
}

function rowCheck(
  id: string,
  ref: AssetRef,
  asset: AssetCheck,
  recordedSize: number | undefined,
): AssetRowCheck {
  if (asset.status === "missing") return { id, ref, status: "missing" };
  if (asset.status === "corrupt") {
    return { id, ref, status: "corrupt", detail: asset.detail };
  }
  const { verification } = asset;
  if (!verification.valid) {
    return {
      id,
      ref,
      status: "corrupt",
      detail: `stored bytes hash to ${verification.actualDigest}`,
    };
  }
  if (recordedSize !== undefined && recordedSize !== verification.sizeBytes) {
    return {
      id,
      ref,
      status: "size-mismatch",
      detail: `row records ${recordedSize} bytes; the asset holds ${verification.sizeBytes}`,
    };
  }
  return { id, ref, status: "valid" };
}
