import type { FSWatcher } from "chokidar";
import chokidar from "chokidar";
import type { Logger } from "@brains/utils/logger";
import { Cause, Effect, Exit, FiberMap, Scope } from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";
import { isImageFile } from "./image-file-utils";
import { resolveInSyncPath, toSyncRelativePath } from "./path-utils";

const WATCH_SUPPRESSION_MS = 10_000;

function isImageInImageDir(path: string, syncPath: string): boolean {
  const relativePath = toSyncRelativePath(syncPath, path);
  if (!relativePath.startsWith("image/")) return false;
  return isImageFile(path);
}

/**
 * Determine whether a file change should be processed by directory sync.
 * Rejects files in underscore-prefixed directories (e.g., _obsidian/)
 * and non-entity files (non-.md, non-image).
 */
export function shouldProcessPath(path: string, syncPath: string): boolean {
  const relativePath = toSyncRelativePath(syncPath, path);
  const firstSegment = relativePath.split("/")[0];
  if (firstSegment?.startsWith("_")) return false;
  if (path.endsWith(".md")) return true;
  return isImageInImageDir(path, syncPath);
}

export interface FileWatcherOptions {
  syncPath: string;
  watchInterval: number;
  logger: Logger;
  onFileChange?: ((event: string, path: string) => Promise<void>) | undefined;
  onFileChanges?:
    ((changes: ReadonlyMap<string, string>) => Promise<void>) | undefined;
  clock?: Clock.Clock | undefined;
}

/**
 * Handles file watching functionality for directory sync
 */
export class FileWatcher {
  private watcher?: FSWatcher | undefined;
  private watchCallback?: ((event: string, path: string) => void) | undefined;
  private pendingChanges = new Map<string, string>();
  private suppressedPaths = new Map<string, number>();
  private readonly delayScope: Scope.CloseableScope;
  private readonly delayedBatches: FiberMap.FiberMap<string, void, never>;
  private readonly clock: Clock.Clock | undefined;
  private readonly activeCallbacks = new Set<Promise<void>>();
  private stopPromise: Promise<void> | null = null;
  private stopping = false;
  private readonly syncPath: string;
  private readonly watchInterval: number;
  private readonly logger: Logger;
  private readonly onFileChange?:
    ((event: string, path: string) => Promise<void>) | undefined;
  private readonly onFileChanges?:
    ((changes: ReadonlyMap<string, string>) => Promise<void>) | undefined;

  constructor(options: FileWatcherOptions) {
    this.syncPath = options.syncPath;
    this.watchInterval = options.watchInterval;
    this.logger = options.logger;
    this.onFileChange = options.onFileChange;
    this.onFileChanges = options.onFileChanges;
    this.clock = options.clock;
    this.delayScope = Effect.runSync(Scope.make());
    this.delayedBatches = Effect.runSync(
      Scope.extend(FiberMap.make<string, void, never>(), this.delayScope),
    );
  }

  async start(): Promise<void> {
    if (this.watcher) {
      this.logger.debug("Already watching directory");
      return;
    }
    if (this.stopping) {
      throw new Error("Cannot restart a stopped file watcher");
    }

    this.logger.debug("Starting directory watch", {
      path: this.syncPath,
      interval: this.watchInterval,
    });

    const watcher = chokidar.watch(this.syncPath, {
      ignored: /(^|[/\\])\../, // ignore dotfiles
      ignoreInitial: true,
      persistent: true,
      interval: this.watchInterval,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    });
    this.watcher = watcher;

    watcher
      .on("add", (path) => void this.handleFileChange("add", path))
      .on("change", (path) => void this.handleFileChange("change", path))
      .on("unlink", (path) => void this.handleFileChange("delete", path))
      .on("error", (error) => this.logger.error("Watcher error", error));

    if (this.watchCallback) {
      watcher.on("all", this.watchCallback);
    }

    try {
      await this.awaitReady(watcher);
    } catch (error) {
      this.watcher = undefined;
      try {
        await watcher.close();
      } catch {
        // Preserve the watcher startup error.
      }
      throw error;
    }
  }

  stop(): Promise<void> {
    this.stopping = true;
    this.stopPromise ??= this.stopWatcher();
    return this.stopPromise;
  }

  private async stopWatcher(): Promise<void> {
    const watcher = this.watcher;
    this.watcher = undefined;

    const closeDelay = this.closeDelayScope();
    this.pendingChanges.clear();
    this.suppressedPaths.clear();

    const cleanup = [
      closeDelay,
      ...(watcher ? [watcher.close()] : []),
      ...this.activeCallbacks,
    ];
    const results = await Promise.allSettled(cleanup);
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (watcher) this.logger.info("Stopped directory watch");
    if (failure) throw failure.reason;
  }

  private awaitReady(watcher: FSWatcher): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onReady = (): void => {
        watcher.off("error", onStartupError);
        resolve();
      };
      const onStartupError = (error: unknown): void => {
        watcher.off("ready", onReady);
        reject(error);
      };
      watcher.once("ready", onReady);
      watcher.once("error", onStartupError);
    });
  }

  setCallback(callback: (event: string, path: string) => void): void {
    this.watchCallback = callback;

    if (this.watcher) {
      this.watcher.on("all", callback);
    }
  }

  suppressPaths(paths: string[]): void {
    const expiresAt = Date.now() + WATCH_SUPPRESSION_MS;
    for (const path of paths) {
      const relativePath = toSyncRelativePath(this.syncPath, path);
      this.pendingChanges.delete(relativePath);
      this.suppressedPaths.set(relativePath, expiresAt);
    }
  }

  private async handleFileChange(event: string, path: string): Promise<void> {
    if (this.stopping || !shouldProcessPath(path, this.syncPath)) {
      return;
    }

    const relativePath = toSyncRelativePath(this.syncPath, path);
    if (this.isSuppressed(relativePath)) {
      this.logger.debug("Suppressed git-triggered file change", {
        event,
        path,
      });
      return;
    }

    this.logger.debug("File change detected", { event, path });
    this.pendingChanges.set(relativePath, event);

    const delayedBatch = Effect.sleep(500).pipe(
      Effect.andThen(Effect.sync(() => this.startPendingProcessing())),
    );
    const ownedDelay = this.clock
      ? Effect.withClock(delayedBatch, this.clock)
      : delayedBatch;
    FiberMap.unsafeSet(
      this.delayedBatches,
      "file-change-batch",
      Effect.runFork(ownedDelay),
    );
  }

  private async processPendingChanges(): Promise<void> {
    if (this.pendingChanges.size === 0) {
      return;
    }

    const changes = new Map(this.pendingChanges);
    this.pendingChanges.clear();

    this.logger.debug("Processing batched file changes", {
      changeCount: changes.size,
    });

    if (this.onFileChanges) {
      const fullChanges = new Map(
        [...changes].map(([path, event]) => [
          resolveInSyncPath(this.syncPath, path),
          event,
        ]),
      );
      try {
        await this.onFileChanges(fullChanges);
      } catch (error) {
        this.logger.error("Error processing file change batch", { error });
      }
      return;
    }

    for (const [path, event] of changes) {
      const fullPath = resolveInSyncPath(this.syncPath, path);

      try {
        if (this.onFileChange) {
          await this.onFileChange(event, fullPath);
        }
      } catch (error) {
        this.logger.error("Error processing file change", {
          path,
          event,
          error,
        });
      }
    }
  }

  private isSuppressed(path: string): boolean {
    const expiresAt = this.suppressedPaths.get(path);
    if (expiresAt === undefined) return false;
    this.suppressedPaths.delete(path);
    return expiresAt > Date.now();
  }

  private startPendingProcessing(): void {
    if (this.stopping) return;

    const callback = this.processPendingChanges();
    this.activeCallbacks.add(callback);
    void callback.then(
      () => this.activeCallbacks.delete(callback),
      () => this.activeCallbacks.delete(callback),
    );
  }

  private async closeDelayScope(): Promise<void> {
    const result = await Effect.runPromiseExit(
      Scope.close(this.delayScope, Exit.void),
    );
    if (Exit.isFailure(result)) throw Cause.squash(result.cause);
  }

  isWatching(): boolean {
    return !!this.watcher;
  }

  getPendingChangesCount(): number {
    return this.pendingChanges.size;
  }
}
