import type { Logger } from "@brains/utils/logger";
import type { JobRequest, IFileOperations } from "../types";

/**
 * Handles file change events from the file watcher
 */
export class EventHandler {
  private readonly logger: Logger;
  private readonly handleImports: (paths: string[]) => Promise<void>;
  private readonly handleDelete: (path: string) => Promise<void>;
  private readonly deleteOnFileRemoval: boolean;
  private readonly fileOperations: IFileOperations;

  constructor(
    logger: Logger,
    importFn: (paths: string[]) => Promise<unknown>,
    jobQueueCallback: ((job: JobRequest) => Promise<string>) | undefined,
    fileOperations: IFileOperations,
    deleteOnFileRemoval = true,
  ) {
    this.logger = logger;
    this.fileOperations = fileOperations;
    this.deleteOnFileRemoval = deleteOnFileRemoval;

    // Create the import handler based on whether we have job queue
    if (jobQueueCallback) {
      this.handleImports = async (paths: string[]): Promise<void> => {
        const jobId = await jobQueueCallback({
          type: "directory-import" as const,
          data: { paths },
        });
        this.logger.debug("Queued import job for file changes", {
          jobId,
          pathCount: paths.length,
        });
      };

      // Create the delete handler
      this.handleDelete = async (path: string): Promise<void> => {
        if (!this.deleteOnFileRemoval) {
          this.logger.warn("File deleted but deleteOnFileRemoval is disabled", {
            path,
          });
          return;
        }

        // Quarantine renames <file> to <file>.invalid: the removal is ours,
        // not the user's, so the entity must survive.
        if (await this.fileOperations.fileExists(`${path}.invalid`)) {
          this.logger.info("File was quarantined, keeping its entity", {
            path,
          });
          return;
        }

        // Extract entity info from file path
        try {
          const { entityType, id } =
            this.fileOperations.parseEntityFromPath(path);

          const jobId = await jobQueueCallback({
            type: "directory-delete" as const,
            data: {
              entityId: id,
              entityType: entityType,
              filePath: path,
            },
          });
          this.logger.info("Queued delete job for removed file", {
            jobId,
            path,
            entityId: id,
            entityType,
          });
        } catch (error) {
          this.logger.warn("Could not extract entity info from deleted file", {
            path,
            error,
          });
        }
      };
    } else {
      this.handleImports = async (paths: string[]): Promise<void> => {
        await importFn(paths);
      };

      // Without job queue, just log
      this.handleDelete = async (path: string): Promise<void> => {
        this.logger.warn("File deleted but no job queue available", { path });
      };
    }
  }

  /**
   * Handle a watcher burst while keeping imports in one queued job.
   * Pending imports are flushed before deletes so event ordering is preserved.
   */
  async handleFileChanges(changes: ReadonlyMap<string, string>): Promise<void> {
    let importPaths: string[] = [];
    const flushImports = async (): Promise<void> => {
      if (importPaths.length === 0) return;
      const paths = importPaths;
      importPaths = [];
      try {
        await this.handleImports(paths);
      } catch (error) {
        this.logger.error("Failed to handle file change batch", {
          paths,
          error,
        });
      }
    };

    for (const [path, event] of changes) {
      if (event === "add" || event === "change") {
        importPaths.push(path);
        continue;
      }

      await flushImports();
      await this.handleFileChange(event, path);
    }
    await flushImports();
  }

  /**
   * Handle file change events
   */
  async handleFileChange(event: string, path: string): Promise<void> {
    this.logger.debug("Processing file change", { event, path });

    try {
      switch (event) {
        case "add":
        case "change":
          await this.handleImports([path]);
          break;

        case "delete":
        case "unlink":
          await this.handleDelete(path);
          break;

        default:
          this.logger.debug("Unhandled file event", { event, path });
      }
    } catch (error) {
      this.logger.error("Failed to handle file change", {
        event,
        path,
        error,
      });
    }
  }
}
