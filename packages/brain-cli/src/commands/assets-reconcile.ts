import { basename, join } from "node:path";
import {
  ASSET_REF_PREFIX,
  createAssetRef,
  getAssetDigest,
  OfflineBinaryMigrator,
  openOfflineEntityDatabase,
  parseAssetRef,
  type OfflineEntityConnection,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { classifyInlineImage, type ImageByteDescription } from "@brains/image";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import {
  listImageFiles,
  readReadableImageFile,
  type ImageFile,
} from "../lib/brain-data-images";
import type { CommandResult } from "../lib/command-result";
import {
  defaultOfflineDatabaseDeps,
  resolveLocalPath,
  resolveOfflineDatabase,
  type OfflineDatabaseDeps,
} from "../lib/offline-database";

export interface AssetsReconcileOptions {
  /** Entity database path or `file:` URL; defaults to the app's data dir. */
  database?: string | undefined;
  /** The synced content directory; defaults to brain-data. */
  from?: string | undefined;
  dryRun?: boolean | undefined;
}

/** What reconciling one image did, or would do. */
type Outcome =
  | "in sync"
  | "awaiting its bytes, left alone"
  | "created"
  | "restored asset"
  | "restored from file"
  | "inline, run assets:migrate"
  | "inline and blocked"
  | "mismatch"
  | "unsupported file"
  | "changed during the run"
  | "unrecoverable";

/** Outcomes that need an operator before the database matches its files. */
const FAILURES: ReadonlySet<Outcome> = new Set([
  "mismatch",
  "unrecoverable",
  // Nothing else writes while the app is stopped.
  "changed during the run",
]);

const rowSchema = z.object({
  id: z.string(),
  content: z.string(),
  contentHash: z.string(),
  status: z.string().nullable(),
});
type ImageRow = z.output<typeof rowSchema>;
const digestSchema = z.object({ digest: z.string() });

/**
 * Rebuild image rows and assets from brain-data while the app is stopped:
 * absent rows are created and lost assets restored, each with its bytes in
 * one transaction. A reference that disagrees with its file is reported and
 * never changed.
 */
export async function runAssetsReconcile(
  cwd: string,
  options: AssetsReconcileOptions,
  deps: OfflineDatabaseDeps = defaultOfflineDatabaseDeps,
): Promise<CommandResult> {
  const database = await resolveOfflineDatabase(cwd, options.database, deps);
  if (!("path" in database)) return database;
  if (!options.dryRun) {
    // The staged asset tables must exist before anything is restored.
    await migrateEntities({ url: `file:${database.path}` });
  }
  const directory = join(
    resolveLocalPath(cwd, options.from ?? "brain-data"),
    "image",
  );
  const connection = openOfflineEntityDatabase(database.path);
  try {
    const rows = new Map(
      (
        await connection.client.execute(
          "SELECT id, content, contentHash, json_extract(metadata, '$.status') AS status FROM entities WHERE entityType = 'image'",
        )
      ).rows.map((raw) => {
        const row = rowSchema.parse(raw);
        return [row.id, row] as const;
      }),
    );
    const stored = await storedDigests(connection);
    const files = await listImageFiles(directory);
    const migrator = new OfflineBinaryMigrator(connection);
    const outcomes = new Map<Outcome, string[]>();
    const unreadable: string[] = [];
    const record = (outcome: Outcome, id: string): void => {
      outcomes.set(outcome, [...(outcomes.get(outcome) ?? []), id]);
    };

    for (const [id, paths] of [...files].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const readable = await readReadableImageFile(id, paths);
      unreadable.push(...readable.unreadable);
      const { file } = readable;
      if (!file) {
        record("unsupported file", id);
        continue;
      }
      const row = rows.get(id);
      const action = decide(row, file, stored);
      record(
        options.dryRun || !isWrite(action)
          ? action
          : await apply(migrator, action, file, file.description, row),
        id,
      );
    }
    // A reference with no asset is only recoverable from a file.
    for (const [id, { content }] of rows) {
      if (
        content.startsWith(ASSET_REF_PREFIX) &&
        !files.has(id) &&
        !stored.has(getAssetDigest(parseAssetRef(content)))
      ) {
        record("unrecoverable", id);
      }
    }

    const failed = [...outcomes.keys()].some((outcome) =>
      FAILURES.has(outcome),
    );
    return {
      success: !failed,
      message: [
        `Binary asset reconcile${options.dryRun ? " dry-run" : ""} for ${database.path} from ${directory}`,
        ...(unreadable.length > 0
          ? [
              `ignored unreadable file(s): ${unreadable.map((path) => basename(path)).join(", ")}`,
            ]
          : []),
        ...[...outcomes].map(
          ([outcome, ids]) =>
            `${options.dryRun && isWrite(outcome) ? `would ${verb(outcome)}` : outcome}: ${ids.join(", ")}`,
        ),
        failed
          ? "Resolve every mismatched, unrecoverable or changed image by hand."
          : "Reconciled.",
      ].join("\n"),
    };
  } catch (error) {
    return {
      success: false,
      message: `Reconcile failed: ${getErrorMessage(error)}`,
    };
  } finally {
    connection.client.close();
  }
}

/** What a file and its row call for; never a change to another reference. */
function decide(
  row: ImageRow | undefined,
  file: ImageFile,
  stored: Set<string>,
): Outcome {
  if (row === undefined) return "created";
  // Its bytes are still being produced; a file is no newer than that.
  if (row.status === "pending" || row.status === "failed") {
    return "awaiting its bytes, left alone";
  }
  const { content } = row;
  const ref = createAssetRef(file.digest);
  if (content === ref) {
    return stored.has(file.digest) ? "in sync" : "restored asset";
  }
  if (content.startsWith(ASSET_REF_PREFIX)) return "mismatch";
  const verdict = classifyInlineImage(content);
  if (verdict.status === "ready") return "inline, run assets:migrate";
  // Only rows whose stored bytes are lost are repaired from the file.
  return verdict.reason === "malformed" || verdict.reason === "double-encoded"
    ? "restored from file"
    : "inline and blocked";
}

function isWrite(outcome: Outcome): boolean {
  return (
    outcome === "created" ||
    outcome === "restored asset" ||
    outcome === "restored from file"
  );
}

function verb(outcome: Outcome): string {
  if (outcome === "created") return "create";
  if (outcome === "restored asset") return "restore asset";
  return "restore from file";
}

async function apply(
  migrator: OfflineBinaryMigrator,
  action: Outcome,
  file: ImageFile,
  described: ImageByteDescription,
  row: ImageRow | undefined,
): Promise<Outcome> {
  const bytes = { bytes: file.source(), expectedSize: file.sizeBytes };
  const metadata = { ...described, sizeBytes: file.sizeBytes };
  if (action === "created") {
    const result = await migrator.createRow("image", {
      id: file.id,
      ...bytes,
      metadata,
      created: file.created.getTime(),
      updated: file.updated.getTime(),
    });
    return result.outcome === "created" ? action : "changed during the run";
  }
  if (action === "restored asset") {
    const result = await migrator.restoreAsset("image", {
      id: file.id,
      ref: createAssetRef(file.digest),
      ...bytes,
    });
    return result.outcome === "restored" ? action : "changed during the run";
  }
  if (!row) return "changed during the run";
  const result = await migrator.migrateRow("image", {
    id: file.id,
    expectedContentHash: row.contentHash,
    ...bytes,
    metadata,
  });
  return result.outcome === "migrated" ? action : "changed during the run";
}

/** Digests already published as assets. */
async function storedDigests(
  connection: OfflineEntityConnection,
): Promise<Set<string>> {
  const result = await connection.client.execute("SELECT digest FROM assets");
  return new Set(result.rows.map((row) => digestSchema.parse(row).digest));
}
