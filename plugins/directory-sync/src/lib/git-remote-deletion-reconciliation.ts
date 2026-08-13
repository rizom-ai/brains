import type { Logger } from "@brains/utils/logger";
import { unlink } from "fs/promises";
import { pathExists } from "./fs-utils";
import { resolveInSyncPath } from "./path-utils";

export interface RemoteDeletionGit {
  add(args: readonly string[]): Promise<unknown>;
  diff(args: readonly string[]): Promise<string>;
  commit(message: string): Promise<unknown>;
}

export interface RemoteDeletionReconciliationOptions {
  git: RemoteDeletionGit;
  logger: Logger;
  syncPath: string;
  deletedFiles: string[];
}

export async function reconcileRemoteDeletedFiles(
  options: RemoteDeletionReconciliationOptions,
): Promise<string[]> {
  const reconciled: string[] = [];

  for (const filePath of options.deletedFiles) {
    const fullPath = resolveInSyncPath(options.syncPath, filePath);
    if (!(await pathExists(fullPath))) continue;

    await unlink(fullPath);
    reconciled.push(filePath);
    options.logger.warn("Removed locally resurrected remote deletion", {
      path: filePath,
    });
  }

  if (reconciled.length > 0) {
    await options.git.add(["-A", "--", ...reconciled]);
    const staged = await options.git.diff([
      "--cached",
      "--name-only",
      "--",
      ...reconciled,
    ]);
    if (staged.trim()) {
      await options.git.commit("Reconcile remote deletions (remote wins)");
    }
  }

  return reconciled;
}
