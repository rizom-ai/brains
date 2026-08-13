import { resolve } from "node:path";
import { resolveStandardConfig } from "@brains/app";
import { FilesystemAssetStore } from "@brains/asset-service";
import { getErrorMessage } from "@brains/utils/error";
import type { CommandResult } from "../lib/command-result";
import { parseBrainYaml } from "../lib/brain-yaml";
import { reconcileImageAssets } from "../lib/binary-asset-reconciliation";
import { SqliteBinaryAssetMigrationRepository } from "../lib/binary-asset-migration-repository";

export interface RunAssetReconciliationOptions {
  entityType?: string | undefined;
  from?: string | undefined;
  dryRun?: boolean | undefined;
  databaseUrl?: string | undefined;
  assetDirectory?: string | undefined;
}

export async function runAssetReconciliation(
  cwd: string,
  options: RunAssetReconciliationOptions,
): Promise<CommandResult> {
  if (options.entityType !== "image") {
    return {
      success: false,
      message:
        "Asset reconciliation currently supports only --entity-type image.",
    };
  }
  if (!options.from) {
    return {
      success: false,
      message: "Missing --from source directory (for example: brain-data).",
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
    const repository = new SqliteBinaryAssetMigrationRepository({
      databaseUrl,
      workingDirectory: cwd,
    });
    const assets = FilesystemAssetStore.createFresh({ assetDirectory });
    const result = await reconcileImageAssets({
      repository,
      assets,
      sourceDirectory: resolve(cwd, options.from),
      dryRun: options.dryRun,
    });
    const lines = [
      "Image asset reconciliation complete.",
      `Image rows: ${result.rowCount}`,
      `Already present: ${result.presentCount}`,
      `Restorable assets: ${result.restorableCount}`,
      `Restored assets: ${result.restoredCount}`,
      `Failures: ${result.failures.length}`,
    ];
    for (const failure of result.failures) {
      lines.push(`- ${failure.id}: ${failure.reason}`);
    }
    return {
      success: result.failures.length === 0,
      message: lines.join("\n"),
    };
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
}
