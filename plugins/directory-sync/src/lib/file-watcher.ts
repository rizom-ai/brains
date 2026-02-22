import type { FSWatcher } from "chokidar";
import chokidar from "chokidar";
import type { Logger } from "@brains/utils";
import { IMAGE_EXTENSIONS } from "./file-operations";

export interface FileWatcherOptions {
  syncPath: string;
  watchInterval: number;
  logger: Logger;
  onFileChange?: ((event: string, path: string) => Promise<void>) | undefined;
}

/**
 * Handles file watching functionality for directory sync
 */
export class FileWatcher {
  private watcher?: FSWatcher | undefined;
  private watchCallback?: ((event: string, path: string) => void) | undefined;
  private pendingChanges = new Map<string, string>();
  private batchTimeout?: NodeJS.Timeout | undefined;
  private readonly syncPath: string;
  private readonly watchInterval: number;
  private readonly logger: Logger;
  private readonly onFileChange?:
    | ((event: string, path: string) => Promise<void>)
    | undefined;

  constructor(options: FileWatcherOptions) {
    this.syncPath = options.syncPath;
    this.watchInterval = options.watchInterval;
    this.logger = options.logger;
    this.onFileChange = options.onFileChange;
  }

  async start(): Promise<void> {
    if (this.watcher) {
      this.logger.debug("Already watching directory");
      return;
    }

    this.logger.debug("Starting directory watch", {
      path: this.syncPath,
      interval: this.watchInterval,
    });

    this.watcher = chokidar.watch(this.syncPath, {
      ignored: /(^|[/\\])\../, // ignore dotfiles
      persistent: true,
      interval: this.watchInterval,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    });

    this.watcher
      .on("add", (path) => void this.handleFileChange("add", path))
      .on("change", (path) => void this.handleFileChange("change", path))
      .on("unlink", (path) => void this.handleFileChange("delete", path))
      .on("error", (error) => this.logger.error("Watcher error", error));

    if (this.watchCallback) {
      this.watcher.on("all", this.watchCallback);
    }
  }

  stop(): void {
    if (this.watcher) {
      void this.watcher.close();
      this.watcher = undefined;
      this.logger.info("Stopped directory watch");
    }

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = undefined;
    }
  }

  setCallback(callback: (event: string, path: string) => void): void {
    this.watchCallback = callback;

    if (this.watcher) {
      this.watcher.on("all", callback);
    }
  }

  private isImageInImageDir(path: string): boolean {
    const relativePath = path.replace(this.syncPath + "/", "");
    if (!relativePath.startsWith("image/")) return false;
    return IMAGE_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext));
  }

  private async handleFileChange(event: string, path: string): Promise<void> {
    if (!path.endsWith(".md") && !this.isImageInImageDir(path)) {
      return;
    }

    this.logger.debug("File change detected", { event, path });

    const relativePath = path.replace(this.syncPath + "/", "");
    this.pendingChanges.set(relativePath, event);

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    this.batchTimeout = setTimeout(() => {
      void this.processPendingChanges();
    }, 500);
  }

  private async processPendingChanges(): Promise<void> {
    if (this.pendingChanges.size === 0) {
      return;
    }

    const changes = new Map(this.pendingChanges);
    this.pendingChanges.clear();
    this.batchTimeout = undefined;

    this.logger.debug("Processing batched file changes", {
      changeCount: changes.size,
    });

    for (const [path, event] of changes) {
      const fullPath = `${this.syncPath}/${path}`;

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

  isWatching(): boolean {
    return !!this.watcher;
  }

  getPendingChangesCount(): number {
    return this.pendingChanges.size;
  }
}
