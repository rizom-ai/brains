import type { Logger } from "@brains/utils/logger";
import { unlink } from "fs/promises";
import { pathExists } from "./fs-utils";
import { resolveInSyncPath } from "./path-utils";

/**
 * The three git commands this reconciliation runs, as it consumes them.
 *
 * Declared rather than Picked from SimpleGit because simple-git returns a
 * chainable Response<T> — a Promise<T> intersected with the whole client — so
 * a Pick would still demand a full client from anything standing in. The real
 * Response<T> is assignable to these promises, and awaiting is all this code
 * does with them.
 */
export interface ReconciliationGit {
  add(files: string[]): Promise<unknown>;
  diff(options: string[]): Promise<string>;
  commit(message: string): Promise<unknown>;
}

export interface RemoteDeletionReconciliationOptions {
  git: ReconciliationGit;
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
