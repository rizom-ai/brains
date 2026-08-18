import type {
  GitLogEntry,
  GitReconciliationCheckpoint,
  GitReconciliationDelta,
  GitSyncStatus,
  PullResult,
} from "../../types";
import { BrokerUnavailableError } from "./client";
import type { BrokerConnection } from "./client";
import type { StatusMessage } from "./protocol";
import { isMutatingOperation } from "./operations";
import type { GitOperation, GitOperationResult } from "./operations";

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
 *
 * The owner can be replaced underneath a running role — that is the point of a
 * proven-safe replacement, which leaves web and worker up — so this reattaches
 * rather than staying broken. What it will not do is decide that an
 * interrupted mutation never happened; see `#run`.
 */

export interface BrokerGitSyncOptions {
  /** Opens a connection to whichever broker currently owns the socket. */
  connect: () => Promise<BrokerConnection>;
  checkoutPath: string;
  branch: string;
  remoteFingerprint: string;
  /** Client-side configuration; reading it needs no Git. */
  remoteUrl: string;
  /**
   * Called when this checkout is registered with a *different* broker than
   * before. Whatever the old owner was in the middle of is ambiguous now, and
   * only the repository can settle it — so the caller reconciles rather than
   * assuming its last mutation did or did not land.
   */
  onOwnerReplaced?: ((brokerId: string) => void) | undefined;
  /** Schedules reattachment/reconciliation without waiting for another call. */
  onOwnerUnavailable?: (() => void) | undefined;
}

export class BrokerGitSync {
  readonly #options: BrokerGitSyncOptions;
  #connection: BrokerConnection | null = null;
  #ownerId: string | null = null;
  #closed = false;

  constructor(options: BrokerGitSyncOptions) {
    this.#options = options;
  }

  /** Attach to the current owner, registering this checkout with it. */
  async attach(): Promise<void> {
    await this.#link();
  }

  async #link(): Promise<BrokerConnection> {
    if (this.#closed) {
      // Reattaching is for an owner that was replaced, not for a client that
      // shut itself down. Reconnecting here would resurrect a role mid-exit.
      throw new BrokerUnavailableError(
        this.#options.checkoutPath,
        "this client has been cleaned up",
      );
    }
    if (this.#connection) return this.#connection;
    const connection = await this.#options.connect();
    let status: StatusMessage;
    try {
      // Registration is where identity is checked, so a replacement owning a
      // different repository is refused here rather than silently adopted.
      status = await connection.registerCheckout({
        checkoutPath: this.#options.checkoutPath,
        branch: this.#options.branch,
        remoteFingerprint: this.#options.remoteFingerprint,
      });
    } catch (error) {
      connection.close();
      throw error;
    }
    this.#connection = connection;
    connection.onUnavailable(() => {
      if (this.#connection !== connection || this.#closed) return;
      this.#connection = null;
      this.#options.onOwnerUnavailable?.();
    });

    // The broker announces its own identity, so a replacement is a fact rather
    // than an inference from a dropped socket: reconnecting to the same owner
    // after a blip is not a replacement.
    const previousOwner = this.#ownerId;
    this.#ownerId = status.brokerId;
    if (previousOwner !== null && previousOwner !== status.brokerId) {
      this.#options.onOwnerReplaced?.(status.brokerId);
    }
    return connection;
  }

  /**
   * Run one operation, surviving a replaced owner without inventing history.
   *
   * A read is replayable: nothing it observed can have changed because this
   * process lost a socket. A mutation is not. If its acknowledgement is lost
   * to a replaced broker, whether it landed is unknowable from here, and
   * re-running it from intent is how one commit becomes two. That is reported
   * to the caller instead — reconciliation from repository state is what
   * resolves it, never a retry.
   */
  async #run<TOperation extends GitOperation>(
    operation: TOperation,
    runOptions: {
      onProgress?: (() => void) | undefined;
      signal?: AbortSignal | undefined;
    } = {},
  ): Promise<GitOperationResult<TOperation["name"]>> {
    const connection = await this.#link();
    try {
      return await connection.execute(
        this.#options.checkoutPath,
        operation,
        runOptions,
      );
    } catch (error) {
      if (!(error instanceof BrokerUnavailableError)) throw error;
      this.#connection = null;
      if (isMutatingOperation(operation)) throw error;

      const replacement = await this.#link();
      return replacement.execute(
        this.#options.checkoutPath,
        operation,
        runOptions,
      );
    }
  }

  /**
   * What the owner currently holds, for a health check to report on.
   *
   * Asked through this client rather than a fresh connection of its own,
   * so the answer describes the owner this role is actually working
   * through — and so nothing else has to know where the socket is.
   */
  async activity(): Promise<{
    activeRequestIds: string[];
    oldestActiveProgressAt: number | null;
  }> {
    const connection = await this.#link();
    const status = await connection.status();
    return {
      activeRequestIds: status.activeRequestIds,
      oldestActiveProgressAt: status.oldestActiveProgressAt,
    };
  }

  /** Whether the owner is currently willing to change the checkout. */
  async admitsMutations(): Promise<boolean> {
    const connection = await this.#link();
    return (await connection.status()).admitsMutations;
  }

  /**
   * Report that this role has reconciled what the previous owner left.
   *
   * The broker cannot know this: the queue and the durable checkpoint live
   * here, not there.
   */
  async openAdmission(): Promise<void> {
    const connection = await this.#link();
    await connection.openAdmission();
  }

  hasRemote(): boolean {
    return this.#options.remoteUrl.length > 0;
  }

  initialize(): Promise<void> {
    return this.#run({ name: "initialize" });
  }

  getStatus(): Promise<GitSyncStatus> {
    return this.#run({ name: "get-status" });
  }

  hasLocalChanges(): Promise<boolean> {
    return this.#run({ name: "has-local-changes" });
  }

  commit(message?: string): Promise<void> {
    return this.#run({
      name: "commit",
      ...(message === undefined ? {} : { message }),
    });
  }

  push(signal?: AbortSignal): Promise<void> {
    return this.#run({ name: "push" }, { ...(signal ? { signal } : {}) });
  }

  commitAndPush(): Promise<{
    pushed: boolean;
    checkpoint: GitReconciliationCheckpoint | null;
  }> {
    return this.#run({ name: "commit-and-push" });
  }

  pull(signal?: AbortSignal, onProgress?: () => void): Promise<PullResult> {
    // Progress still reaches the caller, so operation-status freshness is
    // preserved; a healthy slow pull must not read as stalled.
    return this.#run(
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
    return this.#run({
      name: "get-reconciliation-delta",
      ...(checkpoint === undefined ? {} : { checkpoint }),
    });
  }

  getCheckpoint(): Promise<GitReconciliationCheckpoint> {
    return this.#run({ name: "get-checkpoint" });
  }

  log(filePath: string, limit?: number): Promise<GitLogEntry[]> {
    return this.#run({
      name: "log-file",
      filePath,
      ...(limit === undefined ? {} : { limit }),
    });
  }

  show(sha: string, filePath: string): Promise<string> {
    return this.#run({ name: "show-file", sha, filePath });
  }

  async cleanup(): Promise<void> {
    // Client lifecycle only. The broker owns any operation still running and
    // carries it to a terminal result whether this client watches or not.
    this.#closed = true;
    this.#connection?.close();
    this.#connection = null;
  }
}
