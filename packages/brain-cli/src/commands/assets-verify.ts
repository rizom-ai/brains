import { createHash } from "node:crypto";
import { join } from "node:path";
import { IMAGE_EXTENSIONS } from "@brains/directory-sync";
import {
  base64AssetSource,
  getAssetDigest,
  openOfflineEntityDatabase,
  verifyAssetBackedRows,
  type AssetRowCheck,
} from "@brains/entity-service";
import { inlineImagePayload } from "@brains/image";
import { getErrorMessage } from "@brains/utils/error";
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
    const verification = await verifyAssetBackedRows(connection, "image");
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
  return Promise.all(
    rows.map(async ({ id, ref }): Promise<MirrorCheck> => {
      const digest = await mirroredDigest(join(brainData, "image"), id);
      if (digest === undefined) return { id, status: "absent" };
      return {
        id,
        status: digest === getAssetDigest(ref) ? "match" : "differs",
      };
    }),
  );
}

async function mirroredDigest(
  directory: string,
  id: string,
): Promise<string | undefined> {
  for (const extension of [...IMAGE_EXTENSIONS, ".md"]) {
    const file = Bun.file(join(directory, `${id}${extension}`));
    if (!(await file.exists())) continue;
    const hash = createHash("sha256");
    if (extension === ".md") {
      const payload = inlineImagePayload(await file.text());
      for (const chunk of payload ? base64AssetSource(payload) : []) {
        hash.update(chunk);
      }
    } else {
      for await (const chunk of file.stream()) hash.update(chunk);
    }
    return hash.digest("hex");
  }
  return undefined;
}
