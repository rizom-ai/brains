import { sha256Hex } from "@brains/utils/hash";
import type { Logger } from "@brains/utils/logger";

/**
 * Stall timeout for network git operations (pull/push): if git produces no
 * output for this many milliseconds the operation is treated as stalled and
 * aborted, so a dead remote can't wedge the git lock forever. The timer resets
 * on every chunk of output, so a slow-but-progressing transfer is not killed.
 */
export const DEFAULT_GIT_TIMEOUT_MS = 120_000;

export interface GitSyncOptions {
  logger: Logger;
  dataDir: string;
  repo?: string | undefined;
  gitUrl?: string | undefined;
  branch?: string | undefined;
  authToken?: string | undefined;
  authorName?: string | undefined;
  authorEmail?: string | undefined;
  /** Stall timeout for git operations in ms (defaults to DEFAULT_GIT_TIMEOUT_MS). */
  timeoutMs?: number | undefined;
}

export function resolveGitRemoteUrl(options: GitSyncOptions): string {
  return (
    options.gitUrl ??
    (options.repo ? `https://github.com/${options.repo}.git` : "")
  );
}

/** Stable repository identity that never persists URL credentials. */
export function getGitRemoteFingerprint(remoteUrl: string): string {
  let credentialFreeUrl = remoteUrl;
  try {
    const parsed = new URL(remoteUrl);
    parsed.username = "";
    parsed.password = "";
    credentialFreeUrl = parsed.toString();
  } catch {
    // SCP-style and local paths do not carry URL userinfo. Hash the configured
    // value rather than persisting it in runtime state.
  }
  return sha256Hex(credentialFreeUrl);
}
