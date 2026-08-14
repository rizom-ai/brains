import { OwnedGitProcessRunner } from "./git-stall";
import type { GitCommandRunner } from "./owned-git";

/**
 * The single place a Git command runner is constructed.
 *
 * Every Git path in directory-sync resolves its runner from here rather than
 * building one inline, so the execution boundary can be replaced wholesale.
 * Phase 5 of docs/plans/directory-sync-git-execution-broker.md swaps this for
 * the broker-backed runner; a path that constructed its own would silently
 * keep executing Git inside the app process, which is the defect the broker
 * exists to remove. A test asserts this module is the only construction site.
 */

export interface GitRunnerRequest {
  baseDir: string;
  timeoutMs: number;
  /**
   * Repository preparation — probe, clone, init, branch repair — which runs
   * before the checkout exists and therefore cannot be resolved against a
   * registered one. The broker accepts these under its `bootstrap` operation
   * class and refuses them once the checkout is real.
   */
  bootstrap?: boolean | undefined;
  signal?: AbortSignal | undefined;
  onProgress?: (() => void) | undefined;
}

export type GitRunnerFactory = (request: GitRunnerRequest) => GitCommandRunner;

/** In-process execution: the current behaviour, unchanged. */
export function createOwnedGitRunnerFactory(): GitRunnerFactory {
  return (request): GitCommandRunner =>
    new OwnedGitProcessRunner(
      {
        baseDir: request.baseDir,
        timeoutMs: request.timeoutMs,
        ...(request.onProgress ? { onProgress: request.onProgress } : {}),
      },
      request.signal,
    );
}

export const defaultGitRunnerFactory: GitRunnerFactory =
  createOwnedGitRunnerFactory();
