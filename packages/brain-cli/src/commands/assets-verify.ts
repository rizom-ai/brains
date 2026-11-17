import { join } from "node:path";
import {
  getAssetDigest,
  openOfflineEntityDatabase,
  verifyAssetBackedRows,
  type AssetRowCheck,
} from "@brains/entity-service";
import { getErrorMessage } from "@brains/utils/error";
import {
  BINARY_ASSET_KINDS,
  type BinaryAssetKind,
} from "../lib/binary-asset-kinds";
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
  /** The synced content directory, to compare mirrored files. */
  brainData?: string | undefined;
  /** Continue past leases a crash left; a fresh lease still refuses. */
  ignoreStaleHeartbeat?: boolean | undefined;
}

type MirrorCheck =
  | { id: string; status: "match" | "differs" }
  | { id: string; status: "absent" };

/**
 * Check a migrated database offline: every image and document reference
 * resolves to one intact asset, no inline rows or their full-text rows
 * remain, and each mirrored file holds the stored bytes, so exporting
 * rewrites nothing and reimporting changes no hash.
 */
export async function runAssetsVerify(
  cwd: string,
  options: AssetsVerifyOptions,
  deps: OfflineDatabaseDeps = defaultOfflineDatabaseDeps,
): Promise<CommandResult> {
  const database = await resolveOfflineDatabase(cwd, options.database, deps, {
    ignoreStaleHeartbeat: options.ignoreStaleHeartbeat,
  });
  if (!("path" in database)) return database;
  const connection = openOfflineEntityDatabase(database.path);
  try {
    const reports: Array<{ success: boolean; lines: string[] }> = [];
    for (const kind of BINARY_ASSET_KINDS) {
      reports.push(
        await verifyKind(
          connection,
          kind,
          options.brainData
            ? join(resolveLocalPath(cwd, options.brainData), kind.entityType)
            : undefined,
        ),
      );
    }
    const success = reports.every((report) => report.success);
    return {
      success,
      message: [
        `Binary asset verification for ${database.path}`,
        ...reports.flatMap((report) => report.lines),
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

/** One type's verification, and its mirrored files when a directory is given. */
async function verifyKind(
  connection: ReturnType<typeof openOfflineEntityDatabase>,
  kind: BinaryAssetKind,
  directory: string | undefined,
): Promise<{ success: boolean; lines: string[] }> {
  const { noun } = kind;
  const verification = await verifyAssetBackedRows(
    connection,
    kind.entityType,
    kind.placeholder,
  );
  const mirrors = directory
    ? await checkMirrors(
        kind,
        directory,
        verification.rows.filter((row) => row.status === "valid"),
      )
    : undefined;
  const broken = verification.rows.filter((row) => row.status !== "valid");
  const differs = mirrors?.filter((mirror) => mirror.status === "differs");
  const absent = mirrors?.filter((mirror) => mirror.status === "absent");
  return {
    success:
      broken.length === 0 &&
      verification.inlineRows === 0 &&
      verification.placeholderRows === 0 &&
      verification.ftsRows === 0 &&
      (differs?.length ?? 0) === 0,
    lines: [
      `${verification.rows.length} asset-backed ${noun}(s): ${verification.rows.length - broken.length} valid, ${broken.length} broken.`,
      ...broken.map(
        (row) =>
          `  ${row.id}: ${row.status}${row.detail ? ` (${row.detail})` : ""}`,
      ),
      ...(verification.inlineRows > 0
        ? [
            `${verification.inlineRows} inline ${noun}(s) left: migrate them first.`,
          ]
        : []),
      ...(verification.placeholderRows > 0
        ? [
            `${verification.placeholderRows} old placeholder(s) left on ${noun}s awaiting their bytes: migrate to clear them.`,
          ]
        : []),
      ...(verification.ftsRows > 0
        ? [`${verification.ftsRows} ${noun} full-text row(s) left.`]
        : []),
      ...(mirrors
        ? [
            `${mirrors.length - (differs?.length ?? 0) - (absent?.length ?? 0)} mirrored file(s) match.`,
            ...(differs ?? []).map(
              (mirror) => `  ${mirror.id}: mirrored file differs`,
            ),
            ...(absent?.length
              ? [
                  `${absent.length} ${noun}(s) not mirrored: ${absent.map((mirror) => mirror.id).join(", ")}. Export writes them.`,
                ]
              : []),
          ]
        : []),
    ],
  };
}

/** Compare each record's mirrored files with its digest. */
async function checkMirrors(
  kind: BinaryAssetKind,
  directory: string,
  rows: AssetRowCheck[],
): Promise<MirrorCheck[]> {
  const files = await kind.listFiles(directory);
  return Promise.all(
    rows.map(async ({ id, ref }): Promise<MirrorCheck> => {
      const paths = files.get(id);
      if (!paths) return { id, status: "absent" };
      const digests = await Promise.all(
        paths.map((path) => kind.digestFile(id, path)),
      );
      return {
        id,
        status: digests.includes(getAssetDigest(ref)) ? "match" : "differs",
      };
    }),
  );
}
