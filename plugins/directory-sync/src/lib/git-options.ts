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

/**
 * Separate a credential from the address it was configured with.
 *
 * A `gitUrl` may legitimately arrive as
 * `https://x-access-token:TOKEN@host/repo.git` — that is how remotes were
 * configured before this plan. Writing it verbatim to `origin` puts the
 * token in `.git/config`, inside the checkout that is then cloned, backed
 * up and synced, which safety invariant 6 forbids for every accepted
 * configuration and not only for the separate token field.
 *
 * The credential is not rejected, because rejecting would break a working
 * deployment for a reason the runtime can fix itself. It is moved to where
 * credentials belong: supplied per process, never persisted.
 */
export function splitGitRemoteCredential(url: string): {
  remoteUrl: string;
  token: string | undefined;
} {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // SCP-style addresses and local paths carry no URL userinfo.
    return { remoteUrl: url, token: undefined };
  }
  if (!parsed.username && !parsed.password) {
    return { remoteUrl: url, token: undefined };
  }

  // Git's convention puts the secret in whichever half is present: a bare
  // `https://TOKEN@host` carries it as the username.
  const token = parsed.password || parsed.username;
  parsed.username = "";
  parsed.password = "";
  return { remoteUrl: parsed.toString(), token: token || undefined };
}

/** The address to talk to, never the credential to talk with. */
export function resolveGitRemoteUrl(options: GitSyncOptions): string {
  const configured =
    options.gitUrl ??
    (options.repo ? `https://github.com/${options.repo}.git` : "");
  return splitGitRemoteCredential(configured).remoteUrl;
}

/**
 * The credential to use, wherever it was configured.
 *
 * An explicit `authToken` wins: it is the supported form, and a stale
 * credential left in a URL should not quietly override it.
 */
export function resolveGitCredential(
  options: GitSyncOptions,
): string | undefined {
  if (options.authToken) return options.authToken;
  const configured = options.gitUrl ?? "";
  return splitGitRemoteCredential(configured).token;
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
