import type { IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { JobRequest } from "../types";
import { DirectoryBatchQueue } from "./directory-batch-queue";
import { DirectoryOperationDeps } from "./directory-operation-deps";
import { FileOperations } from "./file-operations";
import { FrontmatterImageConverter } from "./frontmatter-image-converter";
import { MarkdownImageConverter } from "./markdown-image-converter";
import { ProgressOperations } from "./progress-operations";
import { Quarantine } from "./quarantine";

export interface DirectorySyncDependencies {
  fileOperations: FileOperations;
  batchQueue: DirectoryBatchQueue;
  progressOperations: ProgressOperations;
  coverImageConverter: FrontmatterImageConverter;
  inlineImageConverter: MarkdownImageConverter;
  quarantine: Quarantine;
}

export function createDirectorySyncDependencies(
  logger: Logger,
  entityService: IEntityService,
  syncPath: string,
  deleteOnFileRemoval: boolean,
): DirectorySyncDependencies {
  const fileOperations = new FileOperations(syncPath, entityService);

  return {
    fileOperations,
    batchQueue: new DirectoryBatchQueue(
      logger,
      syncPath,
      fileOperations,
      deleteOnFileRemoval,
    ),
    progressOperations: new ProgressOperations(
      logger,
      entityService,
      fileOperations,
    ),
    coverImageConverter: new FrontmatterImageConverter(entityService, logger),
    inlineImageConverter: new MarkdownImageConverter(entityService, logger),
    quarantine: new Quarantine(logger, syncPath),
  };
}

export function createDirectoryOperationDeps(
  logger: Logger,
  entityService: IEntityService,
  syncPath: string,
  dependencies: DirectorySyncDependencies,
  getJobQueueCallback: () => ((job: JobRequest) => Promise<string>) | undefined,
): DirectoryOperationDeps {
  return new DirectoryOperationDeps({
    entityService,
    logger,
    syncPath,
    fileOperations: dependencies.fileOperations,
    quarantine: dependencies.quarantine,
    coverImageConverter: dependencies.coverImageConverter,
    inlineImageConverter: dependencies.inlineImageConverter,
    getJobQueueCallback,
  });
}
