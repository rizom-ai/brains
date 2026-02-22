import type {
  ServicePluginContext,
  BaseEntity,
  IEntityService,
} from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { resolve, isAbsolute } from "path";
import { existsSync, mkdirSync } from "fs";
import { z } from "@brains/utils";
import type {
  DirectorySyncStatus,
  ExportResult,
  ImportResult,
  JobRequest,
} from "../types";
import { FileWatcher } from "./file-watcher";
import { BatchOperationsManager } from "./batch-operations";
import type { BatchMetadata } from "./batch-operations";
import { FileOperations } from "./file-operations";
import { ProgressOperations } from "./progress-operations";
import { EventHandler } from "./event-handler";
import { FrontmatterImageConverter } from "./frontmatter-image-converter";
import { MarkdownImageConverter } from "./markdown-image-converter";
import { Quarantine } from "./quarantine";
import type { ImageJobQueueDeps } from "./image-job-queue";
import { importEntities as runImport } from "./import-pipeline";
import {
  exportEntities as runExport,
  processEntityExport as runProcessEntityExport,
} from "./export-pipeline";

export const directorySyncOptionsSchema = z.object({
  syncPath: z.string(),
  autoSync: z.boolean().optional(),
  watchInterval: z.number().optional(),
  includeMetadata: z.boolean().optional(),
  entityTypes: z.array(z.string()).optional(),
  deleteOnFileRemoval: z.boolean().optional(),
  entityService: z.any(), // We can't validate these complex types with Zod
  logger: z.any(),
});

export type DirectorySyncOptions = z.infer<
  typeof directorySyncOptionsSchema
> & {
  entityService: IEntityService;
  logger: Logger;
};

export class DirectorySync {
  private entityService: IEntityService;
  private logger: Logger;
  private syncPath: string;
  private autoSync: boolean;
  private watchInterval: number;
  private deleteOnFileRemoval: boolean;
  private entityTypes: string[] | undefined;
  private fileWatcher: FileWatcher | undefined;
  private lastSync: Date | undefined;
  private batchOperationsManager: BatchOperationsManager;
  private fileOperations: FileOperations;
  private progressOperations: ProgressOperations;
  private coverImageConverter: FrontmatterImageConverter;
  private inlineImageConverter: MarkdownImageConverter;
  private quarantine: Quarantine;
  private jobQueueCallback?: ((job: JobRequest) => Promise<string>) | undefined;

  constructor(options: DirectorySyncOptions) {
    const { entityService, logger, ...validatableOptions } = options;
    directorySyncOptionsSchema
      .omit({ entityService: true, logger: true })
      .parse(validatableOptions);

    this.entityService = entityService;
    this.logger = logger.child("DirectorySync");

    this.syncPath = isAbsolute(options.syncPath)
      ? options.syncPath
      : resolve(process.cwd(), options.syncPath);

    this.autoSync = options.autoSync ?? true;
    this.watchInterval = options.watchInterval ?? 5000;
    this.deleteOnFileRemoval = options.deleteOnFileRemoval ?? true;
    this.entityTypes = options.entityTypes;
    this.batchOperationsManager = new BatchOperationsManager(
      this.logger,
      this.syncPath,
    );
    this.fileOperations = new FileOperations(this.syncPath, this.entityService);
    this.progressOperations = new ProgressOperations(
      this.logger,
      this.entityService,
      this.fileOperations,
    );
    this.coverImageConverter = new FrontmatterImageConverter(
      this.entityService,
      this.logger,
    );
    this.inlineImageConverter = new MarkdownImageConverter(
      this.entityService,
      this.logger,
    );
    this.quarantine = new Quarantine(this.logger, this.syncPath);

    this.logger.debug("Initialized with path", {
      originalPath: options.syncPath,
      resolvedPath: this.syncPath,
    });
  }

  private getImageJobQueueDeps(): ImageJobQueueDeps {
    return {
      logger: this.logger,
      syncPath: this.syncPath,
      jobQueueCallback: this.jobQueueCallback,
      coverImageConverter: this.coverImageConverter,
      inlineImageConverter: this.inlineImageConverter,
    };
  }

  async initialize(): Promise<void> {
    this.logger.debug("Initializing directory sync", { path: this.syncPath });
    this.ensureSyncPath();

    if (this.autoSync) {
      void this.startWatching();
    }
  }

  async initializeDirectory(): Promise<void> {
    this.logger.debug("Initializing directory structure", {
      path: this.syncPath,
    });
    this.ensureSyncPath();
  }

  private ensureSyncPath(): void {
    if (!existsSync(this.syncPath)) {
      mkdirSync(this.syncPath, { recursive: true });
      this.logger.info("Created sync directory", { path: this.syncPath });
    }
  }

  setJobQueueCallback(callback: (job: JobRequest) => Promise<string>): void {
    this.jobQueueCallback = callback;
  }

  /**
   * Sync entities from directory to database.
   *
   * NOTE: This method only imports (files -> DB). Export (DB -> files) is handled
   * by entity:created/entity:updated subscribers when autoSync is enabled.
   */
  async sync(): Promise<{
    export: ExportResult;
    import: ImportResult;
    duration: number;
  }> {
    const startTime = Date.now();
    this.logger.debug("Starting sync (import only)");

    const importResult = await this.importEntities();

    const duration = Date.now() - startTime;
    this.lastSync = new Date();

    this.logger.debug("Sync completed", {
      duration,
      imported: importResult.imported,
    });

    return {
      export: { exported: 0, failed: 0, errors: [] },
      import: importResult,
      duration,
    };
  }

  async processEntityExport(entity: BaseEntity): Promise<{
    success: boolean;
    deleted?: boolean;
    error?: string;
  }> {
    return runProcessEntityExport(
      {
        entityService: this.entityService,
        logger: this.logger,
        fileOperations: this.fileOperations,
        deleteOnFileRemoval: this.deleteOnFileRemoval,
        entityTypes: this.entityTypes,
      },
      entity,
    );
  }

  async exportEntities(entityTypes?: string[]): Promise<ExportResult> {
    return runExport(
      {
        entityService: this.entityService,
        logger: this.logger,
        fileOperations: this.fileOperations,
        deleteOnFileRemoval: this.deleteOnFileRemoval,
        entityTypes: this.entityTypes,
      },
      entityTypes,
    );
  }

  async importEntitiesWithProgress(
    paths: string[] | undefined,
    reporter: ProgressReporter,
    batchSize: number,
  ): Promise<ImportResult> {
    return this.progressOperations.importEntitiesWithProgress(
      paths,
      reporter,
      batchSize,
      this.importEntities.bind(this),
    );
  }

  async exportEntitiesWithProgress(
    entityTypes: string[] | undefined,
    reporter: ProgressReporter,
    batchSize: number,
  ): Promise<ExportResult> {
    const typesToExport = entityTypes ?? this.entityTypes;
    return this.progressOperations.exportEntitiesWithProgress(
      typesToExport,
      reporter,
      batchSize,
    );
  }

  async importEntities(paths?: string[]): Promise<ImportResult> {
    return runImport(
      {
        entityService: this.entityService,
        logger: this.logger,
        fileOperations: this.fileOperations,
        quarantine: this.quarantine,
        imageJobQueue: this.getImageJobQueueDeps(),
        entityTypes: this.entityTypes,
      },
      paths,
    );
  }

  get fileOps(): FileOperations {
    return this.fileOperations;
  }

  get shouldDeleteOnFileRemoval(): boolean {
    return this.deleteOnFileRemoval;
  }

  getAllMarkdownFiles(): string[] {
    return this.fileOperations.getAllMarkdownFiles();
  }

  async ensureDirectoryStructure(): Promise<void> {
    const entityTypes = this.entityTypes ?? this.entityService.getEntityTypes();
    await this.fileOperations.ensureDirectoryStructure(entityTypes);
  }

  async getStatus(): Promise<DirectorySyncStatus> {
    const { files, stats } = this.fileOperations.gatherFileStatus();

    return {
      syncPath: this.syncPath,
      exists: this.fileOperations.syncDirectoryExists(),
      watching: this.fileWatcher?.isWatching() ?? false,
      lastSync: this.lastSync,
      files,
      stats,
    };
  }

  async queueSyncBatch(
    pluginContext: ServicePluginContext,
    source: string,
    metadata?: BatchMetadata,
  ): Promise<{
    batchId: string;
    operationCount: number;
    exportOperationsCount: number;
    importOperationsCount: number;
    totalFiles: number;
  } | null> {
    const entityTypes = this.entityTypes ?? this.entityService.getEntityTypes();
    const files = this.fileOperations.getAllMarkdownFiles();

    return this.batchOperationsManager.queueSyncBatch(
      pluginContext,
      source,
      entityTypes,
      files,
      metadata,
    );
  }

  async startWatching(): Promise<void> {
    if (this.fileWatcher?.isWatching()) {
      this.logger.debug("Already watching directory");
      return;
    }

    const eventHandler = new EventHandler(
      this.logger,
      this.importEntities.bind(this),
      this.jobQueueCallback,
      this.fileOperations,
      this.deleteOnFileRemoval,
    );

    this.fileWatcher = new FileWatcher({
      syncPath: this.syncPath,
      watchInterval: this.watchInterval,
      logger: this.logger,
      onFileChange: async (event: string, path: string): Promise<void> => {
        await eventHandler.handleFileChange(event, path);
      },
    });

    await this.fileWatcher.start();
  }

  stopWatching(): void {
    if (this.fileWatcher) {
      this.fileWatcher.stop();
      this.fileWatcher = undefined;
    }
  }

  setWatchCallback(callback: (event: string, path: string) => void): void {
    if (this.fileWatcher) {
      this.fileWatcher.setCallback(callback);
    }
  }
}
