import { basename, join } from "node:path";
import {
  ASSET_REF_PREFIX,
  createAssetRef,
  getAssetDigest,
  OfflineBinaryMigrator,
  parseAssetRef,
  type OfflineEntityConnection,
} from "@brains/entity-service";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import {
  BINARY_ASSET_KINDS,
  type BinaryAssetKind,
  type BrainDataFile,
} from "../lib/binary-asset-kinds";
import type { CommandResult } from "../lib/command-result";
import {
  defaultOfflineDatabaseDeps,
  migrateOfflineSchema,
  openOfflineRun,
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
  /** Continue past leases a crash left; a fresh lease still refuses. */
  ignoreStaleHeartbeat?: boolean | undefined;
}

/** What reconciling one record did, or would do. */
type Outcome =
  | "in sync"
  | "awaiting its bytes, left alone"
  | "old pending placeholder, ignored"
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
type BinaryRow = z.output<typeof rowSchema>;
const digestSchema = z.object({ digest: z.string() });

/**
 * Rebuild image and document rows and their assets from brain-data while
 * the app is stopped:
 * absent rows are created and lost assets restored, each with its bytes in
 * one transaction. A reference that disagrees with its file is reported and
 * never changed.
 */
export async function runAssetsReconcile(
  cwd: string,
  options: AssetsReconcileOptions,
  deps: OfflineDatabaseDeps = defaultOfflineDatabaseDeps,
): Promise<CommandResult> {
  const database = await resolveOfflineDatabase(cwd, options.database, deps, {
    ignoreStaleHeartbeat: options.ignoreStaleHeartbeat,
  });
  if (!("path" in database)) return database;
  if (!options.dryRun) {
    // The staged asset tables must exist before anything is restored.
    const failed = await migrateOfflineSchema(database.path);
    if (failed) return failed;
  }
  const root = resolveLocalPath(cwd, options.from ?? "brain-data");
  const run = await openOfflineRun(database.path, {
    command: "assets:reconcile",
    dryRun: options.dryRun,
  });
  if (!("connection" in run)) return run;
  const { connection } = run;
  try {
    const stored = await storedDigests(connection);
    const migrator = new OfflineBinaryMigrator(connection);
    const reports: KindReport[] = [];
    for (const kind of BINARY_ASSET_KINDS) {
      reports.push(
        await reconcileKind(connection, migrator, kind, {
          directory: join(root, kind.entityType),
          stored,
          dryRun: options.dryRun === true,
        }),
      );
    }
    const failed = reports.some((report) =>
      [...report.outcomes.keys()].some((outcome) => FAILURES.has(outcome)),
    );
    return {
      success: !failed,
      message: [
        `Binary asset reconcile${options.dryRun ? " dry-run" : ""} for ${database.path} from ${root}`,
        ...reports.flatMap((report) =>
          report.outcomes.size === 0 && report.unreadable.length === 0
            ? []
            : [
                `${report.kind.noun}s:`,
                ...(report.unreadable.length > 0
                  ? [
                      `ignored unreadable file(s): ${report.unreadable.map((path) => basename(path)).join(", ")}`,
                    ]
                  : []),
                ...[...report.outcomes].map(
                  ([outcome, ids]) =>
                    `${options.dryRun && isWrite(outcome) ? `would ${verb(outcome)}` : outcome}: ${ids.join(", ")}`,
                ),
              ],
        ),
        failed
          ? "Resolve every mismatched, unrecoverable or changed row by hand."
          : "Reconciled.",
      ].join("\n"),
    };
  } catch (error) {
    return {
      success: false,
      message: `Reconcile failed: ${getErrorMessage(error)}`,
    };
  } finally {
    await run.finish();
  }
}

/** What reconciling one type's files and rows did, or would do. */
interface KindReport {
  kind: BinaryAssetKind;
  outcomes: Map<Outcome, string[]>;
  unreadable: string[];
}

async function reconcileKind(
  connection: OfflineEntityConnection,
  migrator: OfflineBinaryMigrator,
  kind: BinaryAssetKind,
  options: { directory: string; stored: Set<string>; dryRun: boolean },
): Promise<KindReport> {
  const { stored } = options;
  const rows = new Map(
    (
      await connection.client.execute({
        sql: "SELECT id, content, contentHash, json_extract(metadata, '$.status') AS status FROM entities WHERE entityType = ?",
        args: [kind.entityType],
      })
    ).rows.map((raw) => {
      const row = rowSchema.parse(raw);
      return [row.id, row] as const;
    }),
  );
  const files = await kind.listFiles(options.directory);
  const outcomes = new Map<Outcome, string[]>();
  const unreadable: string[] = [];
  const record = (outcome: Outcome, id: string): void => {
    outcomes.set(outcome, [...(outcomes.get(outcome) ?? []), id]);
  };

  for (const [id, paths] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    const readable = await kind.readFile(id, paths);
    unreadable.push(...readable.unreadable);
    const { file } = readable;
    if (!file) {
      record("unsupported file", id);
      continue;
    }
    const row = rows.get(id);
    const action = decide(kind, row, file, stored);
    record(
      options.dryRun || !isWrite(action)
        ? action
        : await apply(migrator, kind, action, file, row),
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
  return { kind, outcomes, unreadable };
}

/** What a file and its row call for; never a change to another reference. */
function decide(
  kind: BinaryAssetKind,
  row: BinaryRow | undefined,
  file: BrainDataFile,
  stored: Set<string>,
): Outcome {
  // Its bytes are still being produced; a file is no newer than that.
  if (row?.status === "pending" || row?.status === "failed") {
    return "awaiting its bytes, left alone";
  }
  // An earlier export mirrored the placeholder a pending record held.
  const status = row ? (row.status ?? undefined) : file.metadata["status"];
  if (
    kind.isPlaceholderBytes(
      file.digest,
      typeof status === "string" ? status : undefined,
    )
  ) {
    return "old pending placeholder, ignored";
  }
  if (row === undefined) return "created";
  const { content } = row;
  const ref = createAssetRef(file.digest);
  if (content === ref) {
    return stored.has(file.digest) ? "in sync" : "restored asset";
  }
  if (content.startsWith(ASSET_REF_PREFIX)) return "mismatch";
  const verdict = kind.classify(content);
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
  kind: BinaryAssetKind,
  action: Outcome,
  file: BrainDataFile,
  row: BinaryRow | undefined,
): Promise<Outcome> {
  const { entityType } = kind;
  const bytes = { bytes: file.source(), expectedSize: file.sizeBytes };
  const { metadata } = file;
  if (action === "created") {
    const result = await migrator.createRow(entityType, {
      id: file.id,
      ...bytes,
      metadata,
      created: file.created.getTime(),
      updated: file.updated.getTime(),
    });
    return result.outcome === "created" ? action : "changed during the run";
  }
  if (action === "restored asset") {
    const result = await migrator.restoreAsset(entityType, {
      id: file.id,
      ref: createAssetRef(file.digest),
      ...bytes,
    });
    return result.outcome === "restored" ? action : "changed during the run";
  }
  if (!row) return "changed during the run";
  const result = await migrator.migrateRow(entityType, {
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
