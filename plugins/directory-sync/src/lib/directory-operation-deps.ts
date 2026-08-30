import type { EntityServiceClient } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { CleanupPipelineDeps } from "./cleanup-pipeline";
import type { ExportPipelineDeps } from "./export-pipeline";
import type { FileOperations } from "./file-operations";
import type { FrontmatterImageConverter } from "./frontmatter-image-converter";
import type { ImageJobQueueDeps } from "./image-job-queue";
import type { ImportPipelineDeps } from "./import-pipeline";
import type { MarkdownImageConverter } from "./markdown-image-converter";
import type { Quarantine } from "./quarantine";
import type { JobRequest } from "../types";
import type { PendingDeleteRegistry } from "./pending-delete-registry";

export interface DirectoryOperationDepsOptions {
  entityService: EntityServiceClient;
  logger: Logger;
  syncPath: string;
  fileOperations: FileOperations;
  quarantine: Quarantine;
  coverImageConverter: FrontmatterImageConverter;
  inlineImageConverter: MarkdownImageConverter;
  maxImportFileBytes: number;
  pendingDeletes: PendingDeleteRegistry;
  getJobQueueCallback: () => ((job: JobRequest) => Promise<string>) | undefined;
}

export class DirectoryOperationDeps {
  private readonly options: DirectoryOperationDepsOptions;
  constructor(options: DirectoryOperationDepsOptions) {
    this.options = options;
  }

  createExportDeps(
    deleteOnFileRemoval: boolean,
    entityTypes?: string[],
  ): ExportPipelineDeps {
    return {
      entityService: this.options.entityService,
      logger: this.options.logger,
      fileOperations: this.options.fileOperations,
      deleteOnFileRemoval,
      entityTypes,
    };
  }

  createImportDeps(entityTypes?: string[]): ImportPipelineDeps {
    return {
      entityService: this.options.entityService,
      logger: this.options.logger,
      fileOperations: this.options.fileOperations,
      quarantine: this.options.quarantine,
      imageJobQueue: this.createImageJobQueueDeps(),
      maxImportFileBytes: this.options.maxImportFileBytes,
      entityTypes,
    };
  }

  createCleanupDeps(
    deleteOnFileRemoval: boolean,
    entityTypes?: string[],
  ): CleanupPipelineDeps {
    return {
      entityService: this.options.entityService,
      logger: this.options.logger,
      fileOperations: this.options.fileOperations,
      deleteOnFileRemoval,
      entityTypes,
      onEntityDeleted: (entity): void => {
        this.options.pendingDeletes.complete(
          entity.entityType,
          entity.id,
          this.options.fileOperations.getEntityFilePath(entity),
        );
      },
    };
  }

  private createImageJobQueueDeps(): ImageJobQueueDeps {
    return {
      logger: this.options.logger,
      syncPath: this.options.syncPath,
      jobQueueCallback: this.options.getJobQueueCallback(),
      coverImageConverter: this.options.coverImageConverter,
      inlineImageConverter: this.options.inlineImageConverter,
    };
  }
}
