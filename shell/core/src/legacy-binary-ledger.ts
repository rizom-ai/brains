import {
  legacyBinaryContentUseSchema,
  type LegacyBinaryContentUse,
} from "@brains/plugins";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/runtime-state";
import type { Logger } from "@brains/utils/logger";
import { getErrorMessage } from "@brains/utils/error";

type LegacyBinaryStore = IRuntimeStateStore<LegacyBinaryContentUse>;

/** Where every process of a brain counts legacy reads, in runtime state. */
export function legacyBinaryStore(
  runtimeState: IRuntimeStateNamespace,
): LegacyBinaryStore {
  return runtimeState.scoped({
    namespace: "shell.legacy-binary-content",
    schema: legacyBinaryContentUseSchema,
  });
}

/** One process's share of a key, written by the next flush. */
type Pending = LegacyBinaryContentUse;

/** Attempts to fold one key in while other processes write it too. */
const MAX_WRITE_ATTEMPTS = 8;

/**
 * Counts reads that still turn asset references into data URLs, by surface
 * and entity type, in runtime state that the web and worker processes share
 * and that survives restarts. Each process collects its uses and folds them
 * in shortly after, so a list of a hundred images costs one write per key,
 * not a hundred.
 */
export class LegacyBinaryLedger {
  private readonly store: LegacyBinaryStore;
  private readonly logger: Logger;
  private readonly flushDelayMs: number;
  private readonly now: () => Date;
  private pending = new Map<string, Pending>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writing: Promise<void> = Promise.resolve();

  constructor(options: {
    store: LegacyBinaryStore;
    logger: Logger;
    flushDelayMs?: number | undefined;
    now?: (() => Date) | undefined;
  }) {
    this.store = options.store;
    this.logger = options.logger.child("LegacyBinaryLedger");
    this.flushDelayMs = options.flushDelayMs ?? 1_000;
    this.now = options.now ?? ((): Date => new Date());
  }

  public record(use: { method: string; entityType: string }): void {
    const key = `${use.method}:${use.entityType}`;
    const at = this.now().toISOString();
    const known = this.pending.get(key);
    this.pending.set(key, {
      method: use.method,
      entityType: use.entityType,
      count: (known?.count ?? 0) + 1,
      firstAt: known?.firstAt ?? at,
      lastAt: at,
    });
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, this.flushDelayMs);
    this.timer.unref();
  }

  /** Write every collected use; one that fails waits for the next flush. */
  public flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.writing = this.writing.then(() => this.writePending());
    return this.writing;
  }

  /** Every use recorded so far, this process's included, by surface and type. */
  public async list(): Promise<LegacyBinaryContentUse[]> {
    await this.flush();
    const records = await this.store.list();
    return records
      .map((record) => record.value)
      .sort(
        (a, b) =>
          a.method.localeCompare(b.method) ||
          a.entityType.localeCompare(b.entityType),
      );
  }

  /** Stop the flush timer; call flush() first to keep what is collected. */
  public dispose(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async writePending(): Promise<void> {
    const batch = [...this.pending];
    this.pending = new Map();
    await Promise.all(
      batch.map(async ([key, use]) => {
        try {
          await this.fold(key, use, 1);
        } catch (error) {
          this.keep(key, use);
          this.logger.warn("Could not record legacy binary content use", {
            method: use.method,
            entityType: use.entityType,
            error: getErrorMessage(error),
          });
        }
      }),
    );
  }

  /** Add one process's share to the stored count, retrying on a race. */
  private async fold(
    key: string,
    use: LegacyBinaryContentUse,
    attempt: number,
  ): Promise<void> {
    const stored = await this.store.get(key);
    const written = stored
      ? await this.store.compareAndSet(key, stored, merge(stored, use))
      : await this.store.setIfNotExists(key, use);
    if (written) return;
    if (attempt >= MAX_WRITE_ATTEMPTS) {
      throw new Error("other processes kept changing the count");
    }
    await this.fold(key, use, attempt + 1);
  }

  /** Put a failed share back, merged with any recorded meanwhile. */
  private keep(key: string, use: LegacyBinaryContentUse): void {
    const later = this.pending.get(key);
    this.pending.set(key, later ? merge(use, later) : use);
  }
}

function merge(
  earlier: LegacyBinaryContentUse,
  later: LegacyBinaryContentUse,
): LegacyBinaryContentUse {
  return {
    method: earlier.method,
    entityType: earlier.entityType,
    count: earlier.count + later.count,
    firstAt: earlier.firstAt < later.firstAt ? earlier.firstAt : later.firstAt,
    lastAt: earlier.lastAt > later.lastAt ? earlier.lastAt : later.lastAt,
  };
}
