import type { IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { DirectoryBatchQueue } from "./directory-batch-queue";
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
): DirectorySyncDependencies {
  const fileOperations = new FileOperations(syncPath, entityService);

  return {
    fileOperations,
    batchQueue: new DirectoryBatchQueue(logger, syncPath, fileOperations),
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
