import type { FSWatcher } from "chokidar";
import chokidar from "chokidar";
import type { Logger } from "@brains/plugins";

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
  private readonly onFileChange?: ((event: string, path: string) => Promise<void>) | undefined;

  constructor(options: FileWatcherOptions) {
    this.syncPath = options.syncPath;
    this.watchInterval = options.watchInterval;
    this.logger = options.logger;
    this.onFileChange = options.onFileChange;
  }

  /**
   * Start watching directory for changes
   */
  async start(): Promise<void> {
    if (this.watcher) {
      this.logger.debug("Already watching directory");
      return;
    }

    this.logger.info("Starting directory watch", {
      path: this.syncPath,
      interval: this.watchInterval,
    });

    // Create watcher
    this.watcher = chokidar.watch(this.syncPath, {
      ignored: /(^|[/\\])\../, // ignore dotfiles
      persistent: true,
      interval: this.watchInterval,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    });

    // Set up event handlers
    this.watcher
      .on("add", (path) => void this.handleFileChange("add", path))
      .on("change", (path) => void this.handleFileChange("change", path))
      .on("unlink", (path) => void this.handleFileChange("delete", path))
      .on("error", (error) => this.logger.error("Watcher error", error));

    // Allow external callback
    if (this.watchCallback) {
      this.watcher.on("all", this.watchCallback);
    }
  }

  /**
   * Stop watching directory
   */
  stop(): void {
    if (this.watcher) {
      void this.watcher.close();
      this.watcher = undefined;
      this.logger.info("Stopped directory watch");
    }

    // Clear any pending timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = undefined;
    }
  }

  /**
   * Set watch callback for external handling
   */
  setCallback(callback: (event: string, path: string) => void): void {
    this.watchCallback = callback;

    // If already watching, add the callback
    if (this.watcher) {
      this.watcher.on("all", callback);
    }
  }

  /**
   * Handle file change events by batching them
   */
  private async handleFileChange(event: string, path: string): Promise<void> {
    // Only process markdown files
    if (!path.endsWith(".md")) {
      return;
    }

    this.logger.debug("File change detected", { event, path });

    // Add to pending changes
    const relativePath = path.replace(this.syncPath + "/", "");
    this.pendingChanges.set(relativePath, event);

    // Clear existing timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    // Set new timeout to process batch after 500ms of no activity
    this.batchTimeout = setTimeout(() => {
      void this.processPendingChanges();
    }, 500);
  }

  /**
   * Process pending file changes as a batch
   */
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

    // Process each change
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

  /**
   * Check if watcher is active
   */
  isWatching(): boolean {
    return !!this.watcher;
  }

  /**
   * Get pending changes count
   */
  getPendingChangesCount(): number {
    return this.pendingChanges.size;
  }
}