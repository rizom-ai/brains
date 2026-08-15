import type { SimpleGit } from "simple-git";
import type {
  GitReconciliationCheckpoint,
  GitReconciliationDelta,
} from "../../types";
import { getChangedPaths, tryResolveRemoteHead } from "./git-pull";

/**
 * Reconciliation state derived from the repository itself.
 *
 * Extracted from `GitSync` unchanged so the broker can own these sequences:
 * an operation boundary can only hold one turn for a whole sequence if the
 * sequence is expressible without a `GitSync` instance. Behaviour is identical
 * — the existing reconciliation checkpoint suite is the proof.
 */

export interface ReconciliationIdentity {
  branch: string;
  remoteFingerprint: string;
}

export async function commitExists(
  git: SimpleGit,
  commit: string,
): Promise<boolean> {
  try {
    await git.raw(["cat-file", "-e", `${commit}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

export async function isAncestor(
  git: SimpleGit,
  ancestor: string,
  descendant: string,
): Promise<boolean> {
  try {
    const mergeBase = await git.raw(["merge-base", ancestor, descendant]);
    return mergeBase.trim() === ancestor;
  } catch {
    return false;
  }
}

export async function getCurrentReconciliationCheckpoint(
  git: SimpleGit,
  identity: ReconciliationIdentity,
): Promise<GitReconciliationCheckpoint> {
  const lastObservedRemoteHead = await tryResolveRemoteHead(
    git,
    identity.branch,
  );
  return {
    remoteFingerprint: identity.remoteFingerprint,
    branch: identity.branch,
    lastReconciledGitHead: await git.revparse(["HEAD"]),
    ...(lastObservedRemoteHead ? { lastObservedRemoteHead } : {}),
  };
}

/**
 * Remote-authoritative deletions between two observed remote heads.
 *
 * `undefined` means the remote history cannot be trusted for this comparison,
 * which forces a full scan rather than guessing at deletions.
 */
async function getRemoteChanges(
  git: SimpleGit,
  previous: GitReconciliationCheckpoint,
  current: GitReconciliationCheckpoint,
): Promise<{ deletedFiles: string[] } | undefined> {
  const previousHead = previous.lastObservedRemoteHead;
  const currentHead = current.lastObservedRemoteHead;
  if (!previousHead && !currentHead) return { deletedFiles: [] };
  if (!previousHead || !currentHead) return undefined;
  if (!(await commitExists(git, previousHead))) return undefined;
  if (!(await isAncestor(git, previousHead, currentHead))) return undefined;
  if (previousHead === currentHead) return { deletedFiles: [] };
  const changes = await getChangedPaths(git, previousHead, currentHead);
  return { deletedFiles: changes.deletedFiles };
}

export async function getReconciliationDelta(
  git: SimpleGit,
  identity: ReconciliationIdentity,
  checkpoint?: GitReconciliationCheckpoint,
): Promise<GitReconciliationDelta> {
  const current = await getCurrentReconciliationCheckpoint(git, identity);
  if (!checkpoint) {
    return { mode: "full", checkpoint: current, reason: "missing-checkpoint" };
  }
  if (checkpoint.remoteFingerprint !== identity.remoteFingerprint) {
    return {
      mode: "full",
      checkpoint: current,
      reason: "repository-identity-mismatch",
    };
  }
  if (checkpoint.branch !== identity.branch) {
    return { mode: "full", checkpoint: current, reason: "branch-mismatch" };
  }
  if (!(await commitExists(git, checkpoint.lastReconciledGitHead))) {
    return {
      mode: "full",
      checkpoint: current,
      reason: "missing-local-checkpoint",
    };
  }
  if (
    !(await isAncestor(
      git,
      checkpoint.lastReconciledGitHead,
      current.lastReconciledGitHead,
    ))
  ) {
    return {
      mode: "full",
      checkpoint: current,
      reason: "non-ancestor-local-checkpoint",
    };
  }

  const localChanges =
    checkpoint.lastReconciledGitHead === current.lastReconciledGitHead
      ? { files: [], deletedFiles: [] }
      : await getChangedPaths(
          git,
          checkpoint.lastReconciledGitHead,
          current.lastReconciledGitHead,
        );
  const remoteChanges = await getRemoteChanges(git, checkpoint, current);
  if (!remoteChanges) {
    return {
      mode: "full",
      checkpoint: current,
      reason: "remote-checkpoint-mismatch",
    };
  }

  return {
    mode: "incremental",
    checkpoint: current,
    files: localChanges.files,
    deletedFiles: remoteChanges.deletedFiles,
  };
}
