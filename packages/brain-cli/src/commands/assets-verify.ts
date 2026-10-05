import { join } from "node:path";
import {
  getAssetDigest,
  openOfflineEntityDatabase,
  verifyAssetBackedRows,
  type AssetRowCheck,
} from "@brains/entity-service";
import { LEGACY_PENDING_IMAGE_PLACEHOLDER } from "@brains/image";
import { getErrorMessage } from "@brains/utils/error";
import { listImageFiles, readImageFile } from "../lib/brain-data-images";
import type { CommandResult } from "../lib/command-result";
import {
  defaultOfflineDatabaseDeps,
  resolveLocalPath,
  resolveOfflineDatabase,
  type OfflineDatabaseDeps,
} from "../lib/offline-database";

export interface AssetsVerifyOptions {
  /** Entity database path or `file:` URL; defaults to the app's data dir. */
  database?: string | undefined;
  /** The synced content directory, to compare mirrored image files. */
  brainData?: string | undefined;
}

type MirrorCheck =
  | { id: string; status: "match" | "differs" }
  | { id: string; status: "absent" };

/**
 * Check a migrated database offline: every image reference resolves to one
 * intact asset, no inline images or image full-text rows remain, and each
 * mirrored file holds the stored bytes, so exporting rewrites nothing and
 * reimporting changes no hash.
 */
export async function runAssetsVerify(
  cwd: string,
  options: AssetsVerifyOptions,
  deps: OfflineDatabaseDeps = defaultOfflineDatabaseDeps,
): Promise<CommandResult> {
  const database = await resolveOfflineDatabase(cwd, options.database, deps);
  if (!("path" in database)) return database;
  const connection = openOfflineEntityDatabase(database.path);
  try {
    const verification = await verifyAssetBackedRows(
      connection,
      "image",
      LEGACY_PENDING_IMAGE_PLACEHOLDER,
    );
    const mirrors = options.brainData
      ? await checkMirrors(
          resolveLocalPath(cwd, options.brainData),
          verification.rows.filter((row) => row.status === "valid"),
        )
      : undefined;
    const broken = verification.rows.filter((row) => row.status !== "valid");
    const differs = mirrors?.filter((mirror) => mirror.status === "differs");
    const absent = mirrors?.filter((mirror) => mirror.status === "absent");
    const success =
      broken.length === 0 &&
      verification.inlineRows === 0 &&
      verification.placeholderRows === 0 &&
      verification.ftsRows === 0 &&
      (differs?.length ?? 0) === 0;
    return {
      success,
      message: [
        `Binary asset verification for ${database.path}`,
        `${verification.rows.length} asset-backed image(s): ${verification.rows.length - broken.length} valid, ${broken.length} broken.`,
        ...broken.map(
          (row) =>
            `  ${row.id}: ${row.status}${row.detail ? ` (${row.detail})` : ""}`,
        ),
        ...(verification.inlineRows > 0
          ? [
              `${verification.inlineRows} inline image(s) left: migrate them first.`,
            ]
          : []),
        ...(verification.placeholderRows > 0
          ? [
              `${verification.placeholderRows} old placeholder(s) left on images awaiting their bytes: migrate to clear them.`,
            ]
          : []),
        ...(verification.ftsRows > 0
          ? [`${verification.ftsRows} image full-text row(s) left.`]
          : []),
        ...(mirrors
          ? [
              `${mirrors.length - (differs?.length ?? 0) - (absent?.length ?? 0)} mirrored file(s) match.`,
              ...(differs ?? []).map(
                (mirror) => `  ${mirror.id}: mirrored file differs`,
              ),
              ...(absent?.length
                ? [
                    `${absent.length} image(s) not mirrored: ${absent.map((mirror) => mirror.id).join(", ")}. Export writes them.`,
                  ]
                : []),
            ]
          : []),
        success ? "Verified." : "Verification failed.",
      ].join("\n"),
    };
  } catch (error) {
    return {
      success: false,
      message: `Verification failed: ${getErrorMessage(error)}`,
    };
  } finally {
    connection.client.close();
  }
}

/** Compare each image's mirrored file, binary or text-form, with its digest. */
async function checkMirrors(
  brainData: string,
  rows: AssetRowCheck[],
): Promise<MirrorCheck[]> {
  const files = await listImageFiles(join(brainData, "image"));
  return Promise.all(
    rows.map(async ({ id, ref }): Promise<MirrorCheck> => {
      const paths = files.get(id);
      if (!paths) return { id, status: "absent" };
      const digests = await Promise.all(
        paths.map(async (path) => (await readImageFile(id, path))?.digest),
      );
      return {
        id,
        status: digests.includes(getAssetDigest(ref)) ? "match" : "differs",
      };
    }),
  );
}
