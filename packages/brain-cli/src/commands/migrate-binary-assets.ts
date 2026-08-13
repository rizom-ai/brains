import { statfs } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { resolveStandardConfig } from "@brains/app";
import { getAssetDigest } from "@brains/assets";
import { FilesystemAssetStore } from "@brains/asset-service";
import { getErrorMessage } from "@brains/utils/error";
import type { CommandResult } from "../lib/command-result";
import { parseBrainYaml } from "../lib/brain-yaml";
import {
  BinaryAssetMigrationBlockedError,
  migrateImageAssets,
  verifyImageAssets,
  type ImageMigrationAnalysis,
  type ImageMigrationCandidate,
  type ImageReferenceRow,
} from "../lib/binary-asset-migration";
import { SqliteBinaryAssetMigrationRepository } from "../lib/binary-asset-migration-repository";
import {
  FilesystemBinaryAssetMigrationState,
  type BinaryAssetMigrationManifestEntry,
  type VerifiedAssetJournalEntryInput,
} from "../lib/binary-asset-migration-state";

export interface RunBinaryAssetMigrationOptions {
  entityType?: string | undefined;
  dryRun?: boolean | undefined;
  verify?: boolean | undefined;
  databaseUrl?: string | undefined;
  assetDirectory?: string | undefined;
  stateDirectory?: string | undefined;
}

export async function runBinaryAssetMigration(
  cwd: string,
  options: RunBinaryAssetMigrationOptions,
): Promise<CommandResult> {
  if (!options.entityType) {
    return {
      success: false,
      message:
        "Missing --entity-type. Binary asset migration currently supports only image.",
    };
  }
  if (options.entityType !== "image") {
    return {
      success: false,
      message: "Binary asset migration currently supports only image entities.",
    };
  }
  if (options.dryRun && options.verify) {
    return {
      success: false,
      message: "Choose either --dry-run or --verify, not both.",
    };
  }

  try {
    const brainConfig = parseBrainYaml(cwd);
    const standard = resolveStandardConfig();
    const databaseUrl =
      options.databaseUrl ??
      brainConfig.database ??
      process.env["DATABASE_URL"] ??
      standard.database.url;
    const assetDirectory = resolve(
      cwd,
      options.assetDirectory ?? standard.assetDirectory,
    );
    const stateDirectory = resolve(
      cwd,
      options.stateDirectory ??
        resolve(dirname(assetDirectory), "migrations", "binary-assets"),
    );
    const repository = new SqliteBinaryAssetMigrationRepository({
      databaseUrl,
      workingDirectory: cwd,
    });
    const assets = FilesystemAssetStore.createFresh({ assetDirectory });

    if (options.verify) {
      const verification = await verifyImageAssets({ repository, assets });
      const lines = [
        "Binary asset verification complete.",
        `Image rows: ${verification.rowCount}`,
        `Verified rows: ${verification.verifiedCount}`,
        `Incomplete rows: ${verification.incompleteCount}`,
        `Failures: ${verification.failures.length}`,
      ];
      for (const failure of verification.failures) {
        lines.push(`- ${failure.id}: ${failure.reason}`);
      }
      return {
        success: verification.failures.length === 0,
        message: lines.join("\n"),
      };
    }

    if (!options.dryRun) {
      console.log(
        "Binary asset migration requires the brain application and every worker to remain stopped until this command completes.",
      );
    }

    const state = new FilesystemBinaryAssetMigrationState({
      stateDirectory,
      entityType: "image",
    });
    const availableBytes = await getAvailableBytes(assetDirectory);
    const result = await migrateImageAssets({
      repository,
      assets,
      dryRun: options.dryRun,
      availableAssetBytes: availableBytes,
      canReuseVerifiedAsset: async (candidate) =>
        state.canReuseVerifiedAsset(toJournalInput(candidate)),
      onAssetVerified: async (candidate) =>
        state.recordVerifiedAsset(toJournalInput(candidate)),
    });

    if (options.dryRun) {
      return {
        success: true,
        message: formatDryRun(result.analysis, availableBytes),
      };
    }

    const entries: BinaryAssetMigrationManifestEntry[] = [
      ...result.analysis.candidates.map(candidateManifestEntry),
      ...result.analysis.references.map(referenceManifestEntry),
    ];
    if (result.migratedCount > 0 || !(await state.hasManifest())) {
      await state.complete({
        migratedCount: result.migratedCount,
        verifiedCount: result.verifiedCount,
        entries,
      });
    }

    return {
      success: true,
      message: [
        "Binary asset migration complete.",
        `Migrated rows: ${result.migratedCount}`,
        `Already migrated and verified: ${result.verifiedCount}`,
        "The expected one-time content-hash changes are now committed.",
      ].join("\n"),
    };
  } catch (error) {
    if (error instanceof BinaryAssetMigrationBlockedError) {
      return {
        success: false,
        message: formatBlockedMigration(error.analysis),
      };
    }
    return {
      success: false,
      message: getErrorMessage(error),
    };
  }
}

function formatDryRun(
  analysis: ImageMigrationAnalysis,
  availableBytes: number,
): string {
  return [
    "Binary asset migration dry run complete. No assets or entity rows were written.",
    `Image rows: ${analysis.rowCount}`,
    `Legacy rows: ${analysis.legacyCount}`,
    `Already migrated rows: ${analysis.referenceCount}`,
    `Incomplete rows: ${analysis.incompleteCount}`,
    `Blocking rows: ${analysis.blockers.length}`,
    `Legacy decoded bytes: ${analysis.legacyBytes}`,
    `Unique asset bytes required: ${analysis.uniqueAssetBytes}`,
    `Duplicate bytes saved: ${analysis.duplicateBytesSaved}`,
    `Available filesystem bytes: ${availableBytes}`,
    `Expected content-hash changes: ${analysis.legacyCount}`,
  ].join("\n");
}

function formatBlockedMigration(analysis: ImageMigrationAnalysis): string {
  const lines = [
    `Binary asset migration blocked by ${analysis.blockers.length} image row${analysis.blockers.length === 1 ? "" : "s"}. No entity rows were changed.`,
    `Image rows: ${analysis.rowCount}`,
    `Legacy rows ready: ${analysis.legacyCount}`,
    `Already migrated rows: ${analysis.referenceCount}`,
    `Incomplete rows: ${analysis.incompleteCount}`,
    `Unique asset bytes required: ${analysis.uniqueAssetBytes}`,
    `Duplicate bytes saved: ${analysis.duplicateBytesSaved}`,
    `Expected content-hash changes: ${analysis.legacyCount}`,
  ];
  for (const blocker of analysis.blockers) {
    lines.push(`- ${blocker.id}: ${blocker.reason}`);
  }
  return lines.join("\n");
}

function toJournalInput(
  candidate: ImageMigrationCandidate,
): VerifiedAssetJournalEntryInput {
  return {
    entityId: candidate.id,
    oldContentHash: candidate.expectedContentHash,
    ref: candidate.ref,
    mediaType: candidate.mediaType,
    sizeBytes: candidate.sizeBytes,
  };
}

function candidateManifestEntry(
  candidate: ImageMigrationCandidate,
): BinaryAssetMigrationManifestEntry {
  return {
    entityId: candidate.id,
    oldContentHash: candidate.expectedContentHash,
    assetDigest: candidate.digest,
    mediaType: candidate.mediaType,
    sizeBytes: candidate.sizeBytes,
    status: getStatus(candidate.metadata),
    outcome: "migrated",
  };
}

function referenceManifestEntry(
  reference: ImageReferenceRow,
): BinaryAssetMigrationManifestEntry {
  const mediaType = reference.metadata["mediaType"];
  const sizeBytes = reference.metadata["sizeBytes"];
  if (typeof mediaType !== "string" || typeof sizeBytes !== "number") {
    throw new Error(`Image ${reference.id} has incomplete binary metadata`);
  }
  return {
    entityId: reference.id,
    oldContentHash: reference.contentHash,
    assetDigest: getAssetDigest(reference.ref),
    mediaType,
    sizeBytes,
    status: getStatus(reference.metadata),
    outcome: "verified",
  };
}

function getStatus(metadata: Record<string, unknown>): string {
  const status = metadata["status"];
  return status === "pending" || status === "draft" || status === "failed"
    ? status
    : "completed";
}

async function getAvailableBytes(path: string): Promise<number> {
  try {
    const stats = await statfs(path);
    return stats.bavail * stats.bsize;
  } catch (error) {
    const parent = dirname(path);
    if (!isMissingPath(error) || parent === path) throw error;
    return getAvailableBytes(parent);
  }
}

function isMissingPath(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
