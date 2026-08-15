import type {
  GitLogEntry,
  GitReconciliationCheckpoint,
  GitReconciliationDelta,
  GitSyncStatus,
  PullResult,
} from "../../types";
import type { BrokerConnection } from "./client";

/**
 * `IGitSync` over the broker.
 *
 * Callers keep the seam they already had; what changes is that every method is
 * one owned operation rather than a sequence they run themselves. That is the
 * whole point — `commit` here is atomic against another process's `commit`,
 * which the in-process implementation could not offer at any lock granularity
 * it had available.
 *
 * `withLock` is deliberately not implemented. It was a lease held across work
 * the broker cannot see, and the two callers that used it composed *multiple*
 * operations under it, so it never made a single operation atomic anyway.
 * Its sequencing moves into operations whose typed results carry what the
 * caller needs.
 */

export interface BrokerGitSyncOptions {
  connection: BrokerConnection;
  checkoutPath: string;
  /** Client-side configuration; reading it needs no Git. */
  remoteUrl: string;
}

export class BrokerGitSync {
  readonly #connection: BrokerConnection;
  readonly #checkoutPath: string;
  readonly #remoteUrl: string;

  constructor(options: BrokerGitSyncOptions) {
    this.#connection = options.connection;
    this.#checkoutPath = options.checkoutPath;
    this.#remoteUrl = options.remoteUrl;
  }

  hasRemote(): boolean {
    return this.#remoteUrl.length > 0;
  }

  initialize(): Promise<void> {
    return this.#connection.execute(this.#checkoutPath, {
      name: "initialize",
    });
  }

  getStatus(): Promise<GitSyncStatus> {
    return this.#connection.execute(this.#checkoutPath, {
      name: "get-status",
    });
  }

  hasLocalChanges(): Promise<boolean> {
    return this.#connection.execute(this.#checkoutPath, {
      name: "has-local-changes",
    });
  }

  commit(message?: string): Promise<void> {
    return this.#connection.execute(this.#checkoutPath, {
      name: "commit",
      ...(message === undefined ? {} : { message }),
    });
  }

  push(signal?: AbortSignal): Promise<void> {
    return this.#connection.execute(
      this.#checkoutPath,
      { name: "push" },
      { ...(signal ? { signal } : {}) },
    );
  }

  commitAndPush(): Promise<{
    pushed: boolean;
    checkpoint: GitReconciliationCheckpoint | null;
  }> {
    return this.#connection.execute(this.#checkoutPath, {
      name: "commit-and-push",
    });
  }

  pull(signal?: AbortSignal, onProgress?: () => void): Promise<PullResult> {
    // Progress still reaches the caller, so operation-status freshness is
    // preserved; a healthy slow pull must not read as stalled.
    return this.#connection.execute(
      this.#checkoutPath,
      { name: "pull" },
      {
        ...(onProgress ? { onProgress } : {}),
        ...(signal ? { signal } : {}),
      },
    );
  }

  getReconciliationDelta(
    checkpoint?: GitReconciliationCheckpoint,
  ): Promise<GitReconciliationDelta> {
    return this.#connection.execute(this.#checkoutPath, {
      name: "get-reconciliation-delta",
      ...(checkpoint === undefined ? {} : { checkpoint }),
    });
  }

  getCheckpoint(): Promise<GitReconciliationCheckpoint> {
    return this.#connection.execute(this.#checkoutPath, {
      name: "get-checkpoint",
    });
  }

  log(filePath: string, limit?: number): Promise<GitLogEntry[]> {
    return this.#connection.execute(this.#checkoutPath, {
      name: "log-file",
      filePath,
      ...(limit === undefined ? {} : { limit }),
    });
  }

  show(sha: string, filePath: string): Promise<string> {
    return this.#connection.execute(this.#checkoutPath, {
      name: "show-file",
      sha,
      filePath,
    });
  }

  async cleanup(): Promise<void> {
    // Client lifecycle only. The broker owns any operation still running and
    // carries it to a terminal result whether this client watches or not.
    this.#connection.close();
  }
}
