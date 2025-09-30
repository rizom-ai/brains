import type { Logger } from "@brains/plugins";
import type { JobRequest } from "../types";
import type { FileOperations } from "./file-operations";

/**
 * Handles file change events from the file watcher
 */
export class EventHandler {
  private readonly logger: Logger;
  private readonly handleImport: (path: string) => Promise<void>;
  private readonly handleDelete: (path: string) => Promise<void>;
  private readonly deleteOnFileRemoval: boolean;
  private readonly fileOperations: FileOperations;

  constructor(
    logger: Logger,
    importFn: (paths: string[]) => Promise<unknown>,
    jobQueueCallback: ((job: JobRequest) => Promise<string>) | undefined,
    fileOperations: FileOperations,
    deleteOnFileRemoval = true,
  ) {
    this.logger = logger;
    this.fileOperations = fileOperations;
    this.deleteOnFileRemoval = deleteOnFileRemoval;

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

      // Create the delete handler
      this.handleDelete = async (path: string): Promise<void> => {
        if (!this.deleteOnFileRemoval) {
          this.logger.warn("File deleted but deleteOnFileRemoval is disabled", { path });
          return;
        }

        // Extract entity info from file path
        try {
          const { entityType, id } = this.fileOperations.parseEntityFromPath(path);

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
          this.logger.warn("Could not extract entity info from deleted file", { path, error });
        }
      };
    } else {
      this.handleImport = async (path: string): Promise<void> => {
        await importFn([path]);
      };

      // Without job queue, just log
      this.handleDelete = async (path: string): Promise<void> => {
        this.logger.warn("File deleted but no job queue available", { path });
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
