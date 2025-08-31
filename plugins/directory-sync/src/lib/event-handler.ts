import type { Logger } from "@brains/plugins";
import type { JobRequest } from "../types";

/**
 * Handles file change events from the file watcher
 */
export class EventHandler {
  private readonly logger: Logger;
  private readonly handleImport: (path: string) => Promise<void>;

  constructor(
    logger: Logger,
    importFn: (paths: string[]) => Promise<unknown>,
    jobQueueCallback: ((job: JobRequest) => Promise<string>) | undefined,
  ) {
    this.logger = logger;

    // Create the import handler based on whether we have job queue
    if (jobQueueCallback) {
      this.handleImport = async (path: string): Promise<void> => {
        const jobId = await jobQueueCallback({
          type: "directory-import" as const,
          data: {
            paths: [path],
          },
        });
        this.logger.debug("Queued import job for file change", {
          jobId,
          path,
        });
      };
    } else {
      this.handleImport = async (path: string): Promise<void> => {
        await importFn([path]);
      };
    }
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
          await this.handleImport(path);
          break;

        case "delete":
        case "unlink":
          // Entity deletion is not handled automatically to prevent data loss
          this.logger.warn("File deleted, manual sync required", { path });
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
