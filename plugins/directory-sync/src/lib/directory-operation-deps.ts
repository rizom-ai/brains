import type { SyncGuard } from "./sync-guard";
import type { ServiceEntityMirrorClient } from "@brains/sdk/internal/service-runtime";
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
import type { ImportLimits } from "./directory-options";
import type { SyncConflicts } from "./sync-base";

export interface DirectoryOperationDepsOptions extends ImportLimits {
  entityService: ServiceEntityMirrorClient;
  logger: Logger;
  syncPath: string;
  fileOperations: FileOperations;
  quarantine: Quarantine;
  coverImageConverter: FrontmatterImageConverter;
  inlineImageConverter: MarkdownImageConverter;
  pendingDeletes: PendingDeleteRegistry;
  getJobQueueCallback: () =>
    ((job: JobRequest) => Promise<string | undefined>) | undefined;
  conflicts?: SyncConflicts | undefined;
  guard?: SyncGuard | undefined;
}

export class DirectoryOperationDeps {
  private readonly options: DirectoryOperationDepsOptions;
  constructor(options: DirectoryOperationDepsOptions) {
    this.options = options;
  }

  /** Whether a type's records never leave the database. */
  keptOutOfRepo(entityType: string): boolean {
    const { entityService } = this.options;
    return (
      entityService.hasEntityType(entityType) &&
      entityService.getEntityTypeConfig(entityType).contentRepo === false
    );
  }

  createExportDeps(
    deleteOnFileRemoval: boolean,
    entityTypes?: string[],
  ): ExportPipelineDeps {
    const { entityService, fileOperations, guard } = this.options;
    return {
      entityService: {
        getEntityTypes: () => entityService.getEntityTypes(),
        listEntities: (request) => entityService.listEntities(request),
        deleteEntity: (request) => this.deleteForRemovedFile(request),
      },
      logger: this.options.logger,
      fileOperations: {
        assertEntityPlacement: (entity) =>
          fileOperations.assertEntityPlacement(entity),
        resolveEntityFilePath: (entity) =>
          fileOperations.resolveEntityFilePath(entity),
        fileExists: (filePath) => fileOperations.fileExists(filePath),
        writeEntity: (entity) =>
          guard
            ? guard.writeEntityFile(entity)
            : fileOperations.writeEntity(entity),
      },
      deleteOnFileRemoval,
      entityTypes,
      keptOutOfRepo: (entityType) => this.keptOutOfRepo(entityType),
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
      maxAssetImportBytes: this.options.maxAssetImportBytes,
      entityTypes,
      conflicts: this.options.conflicts,
      restoreEntityFile: (entity) =>
        this.options.fileOperations.writeEntity(entity),
    };
  }

  createCleanupDeps(
    deleteOnFileRemoval: boolean,
    entityTypes?: string[],
  ): CleanupPipelineDeps {
    const { entityService } = this.options;
    return {
      entityService: {
        getEntityTypes: () => entityService.getEntityTypes(),
        listEntities: (request) => entityService.listEntities(request),
        deleteEntity: (request) => this.deleteForRemovedFile(request),
      },
      logger: this.options.logger,
      fileOperations: this.options.fileOperations,
      deleteOnFileRemoval,
      entityTypes,
      keptOutOfRepo: (entityType) => this.keptOutOfRepo(entityType),
      // The pulled deletion names whichever of its files was removed.
      onEntityDeleted: (entity): void => {
        this.options.fileOperations
          .getEntityFileCandidates(entity)
          .forEach((filePath) =>
            this.options.pendingDeletes.complete(
              entity.entityType,
              entity.id,
              filePath,
            ),
          );
      },
    };
  }

  /** True when the entity is gone; false when it changed and stays. */
  private async deleteForRemovedFile(request: {
    entityType: string;
    id: string;
  }): Promise<boolean> {
    const { entityService, guard } = this.options;
    if (!guard) {
      return entityService.deleteEntity({
        ...request,
        options: { persistenceOrigin: "directory-sync" },
      });
    }
    const outcome = await guard.deleteForRemovedFile(
      request.entityType,
      request.id,
    );
    return outcome !== "kept";
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
