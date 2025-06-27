import type { EntityService, BaseEntity, Logger } from "@brains/types";
import type { FSWatcher } from "chokidar";
import chokidar from "chokidar";
import { join, basename, dirname, resolve, isAbsolute } from "path";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from "fs";
import { z } from "zod";
import type {
  DirectorySyncStatus,
  ExportResult,
  ImportResult,
  SyncResult,
  RawEntity,
} from "./types";

/**
 * DirectorySync options schema
 */
export const directorySyncOptionsSchema = z.object({
  syncPath: z.string(),
  watchEnabled: z.boolean().optional(),
  watchInterval: z.number().optional(),
  includeMetadata: z.boolean().optional(),
  entityTypes: z.array(z.string()).optional(),
  entityService: z.any(), // We can't validate these complex types with Zod
  logger: z.any(),
});

export type DirectorySyncOptions = z.infer<
  typeof directorySyncOptionsSchema
> & {
  entityService: EntityService;
  logger: Logger;
};

/**
 * DirectorySync handles synchronization of entities with a directory structure
 */
export class DirectorySync {
  private entityService: EntityService;
  private logger: Logger;
  private syncPath: string;
  private watchEnabled: boolean;
  private watchInterval: number;
  private entityTypes: string[] | undefined;
  private watcher: FSWatcher | undefined;
  private lastSync: Date | undefined;
  private watchCallback: ((event: string, path: string) => void) | undefined;

  constructor(options: DirectorySyncOptions) {
    // Validate options (excluding the complex types)
    const { entityService, logger, ...validatableOptions } = options;
    directorySyncOptionsSchema
      .omit({ entityService: true, logger: true })
      .parse(validatableOptions);

    this.entityService = entityService;
    this.logger = logger.child("DirectorySync");

    // Resolve sync path - support both relative and absolute paths
    this.syncPath = isAbsolute(options.syncPath)
      ? options.syncPath
      : resolve(process.cwd(), options.syncPath);

    this.watchEnabled = options.watchEnabled ?? false;
    this.watchInterval = options.watchInterval ?? 5000;
    this.entityTypes = options.entityTypes;

    this.logger.debug("Initialized with path", {
      originalPath: options.syncPath,
      resolvedPath: this.syncPath,
    });
  }

  /**
   * Initialize directory structure
   */
  async initialize(): Promise<void> {
    this.logger.debug("Initializing directory sync", { path: this.syncPath });

    // Ensure sync path exists
    if (!existsSync(this.syncPath)) {
      mkdirSync(this.syncPath, { recursive: true });
      this.logger.info("Created sync directory", {
        path: this.syncPath,
      });
    }

    // Start watching if enabled
    if (this.watchEnabled) {
      this.startWatching();
    }
  }

  /**
   * Sync all entities with directory
   */
  async sync(): Promise<SyncResult> {
    const startTime = Date.now();
    this.logger.info("Starting full sync");

    // Import from directory first
    const importResult = await this.importEntities();

    // Export all entities
    const exportResult = await this.exportEntities();

    const duration = Date.now() - startTime;
    this.lastSync = new Date();

    this.logger.info("Full sync completed", {
      duration,
      imported: importResult.imported,
      exported: exportResult.exported,
    });

    return {
      export: exportResult,
      import: importResult,
      duration,
    };
  }

  /**
   * Export all entities to directory
   */
  async exportEntities(entityTypes?: string[]): Promise<ExportResult> {
    this.logger.debug("Exporting entities to directory");

    const typesToExport =
      entityTypes ?? this.entityTypes ?? this.entityService.getEntityTypes();
    const result: ExportResult = {
      exported: 0,
      failed: 0,
      errors: [],
    };

    // For each entity type, get all entities and save to markdown
    for (const entityType of typesToExport) {
      const entities = await this.entityService.listEntities(entityType, {
        limit: 1000, // Get all entities
      });

      for (const entity of entities) {
        try {
          await this.writeEntity(entity);
          result.exported++;
          this.logger.debug("Exported entity", { entityType, id: entity.id });
        } catch (error) {
          result.failed++;
          result.errors.push({
            entityId: entity.id,
            entityType,
            error: error instanceof Error ? error.message : String(error),
          });
          this.logger.error("Failed to export entity", {
            entityType,
            id: entity.id,
            error,
          });
        }
      }
    }

    this.logger.info("Export completed", result);
    return result;
  }

  /**
   * Import entities from directory
   */
  async importEntities(paths?: string[]): Promise<ImportResult> {
    this.logger.debug("Importing entities from directory");

    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    // Get all files to process
    const filesToProcess = paths ?? this.getAllMarkdownFiles();

    for (const filePath of filesToProcess) {
      try {
        const rawEntity = await this.readEntity(filePath);

        // Skip if entity type is not in our filter
        if (
          this.entityTypes &&
          !this.entityTypes.includes(rawEntity.entityType)
        ) {
          result.skipped++;
          continue;
        }

        try {
          // Deserialize the markdown content to get parsed fields
          const parsedEntity = this.entityService.deserializeEntity(
            rawEntity.content,
            rawEntity.entityType,
          );

          // Check if entity exists
          const existing = await this.entityService.getEntity(
            rawEntity.entityType,
            rawEntity.id,
          );

          if (existing) {
            // Update if modified (compare timestamps)
            const existingTime = new Date(existing.updated).getTime();
            const newTime = rawEntity.updated.getTime();
            if (existingTime < newTime) {
              // Build entity for update, preserving existing fields and merging parsed content
              const entityUpdate = {
                ...existing,
                content: rawEntity.content,
                ...parsedEntity,
                id: rawEntity.id,
                entityType: rawEntity.entityType,
                updated: rawEntity.updated.toISOString(),
              };
              await this.entityService.updateEntity(entityUpdate);
            }
          } else {
            // Create new entity with all required fields
            const entityCreate = {
              id: rawEntity.id,
              entityType: rawEntity.entityType,
              content: rawEntity.content,
              ...parsedEntity,
              created: rawEntity.created.toISOString(),
              updated: rawEntity.updated.toISOString(),
            };
            await this.entityService.createEntity(entityCreate);
          }
        } catch (deserializeError) {
          // Skip if entity type is not registered or deserialization fails
          this.logger.debug("Skipping file - unable to deserialize", {
            path: filePath,
            entityType: rawEntity.entityType,
            error:
              deserializeError instanceof Error
                ? deserializeError.message
                : String(deserializeError),
          });
          result.skipped++;
          continue;
        }
        result.imported++;
        this.logger.debug("Imported entity from directory", {
          path: filePath,
          entityType: rawEntity.entityType,
        });
      } catch (error) {
        result.failed++;
        result.errors.push({
          path: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
        this.logger.error("Failed to import entity", {
          path: filePath,
          error,
        });
      }
    }

    this.logger.info("Import completed", result);
    return result;
  }

  /**
   * Write entity to file
   */
  async writeEntity(entity: BaseEntity): Promise<void> {
    // Serialize entity to markdown
    const markdown = this.entityService.serializeEntity(entity);
    const filePath = this.getEntityFilePath(entity);

    // Ensure directory exists (only for non-base entities)
    if (entity.entityType !== "base") {
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    // Write markdown file
    writeFileSync(filePath, markdown, "utf-8");
  }

  /**
   * Read entity from file
   */
  async readEntity(filePath: string): Promise<RawEntity> {
    const fullPath = filePath.startsWith(this.syncPath)
      ? filePath
      : join(this.syncPath, filePath);

    const markdown = readFileSync(fullPath, "utf-8");
    const stats = statSync(fullPath);

    // Determine entity type from path
    const relativePath = fullPath.replace(this.syncPath + "/", "");
    const pathParts = relativePath.split("/");
    const entityType =
      pathParts.length > 1 && pathParts[0] ? pathParts[0] : "base";

    // Extract filename without extension for id
    const filename = basename(fullPath, ".md");

    // Use file timestamps, but fallback to current time if birthtime is invalid
    const created =
      stats.birthtime.getTime() > 0 ? stats.birthtime : stats.mtime;
    const updated = stats.mtime;

    return {
      entityType,
      id: filename,
      content: markdown,
      created,
      updated,
    };
  }

  /**
   * Get entity file path
   */
  getEntityFilePath(entity: BaseEntity): string {
    // Base entities go in root directory, others in subdirectories
    if (entity.entityType === "base") {
      return join(this.syncPath, `${entity.id}.md`);
    } else {
      // Other entity types go in their own directories
      return join(this.syncPath, entity.entityType, `${entity.id}.md`);
    }
  }

  /**
   * Get all markdown files in sync directory
   */
  private getAllMarkdownFiles(): string[] {
    const files: string[] = [];

    // Get all entries in the sync directory
    const entries = readdirSync(this.syncPath, { withFileTypes: true });

    // Process root directory files as base entity type
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .forEach((entry) => files.push(entry.name));

    // Process subdirectories
    const subDirs = entries.filter(
      (entry) => entry.isDirectory() && !entry.name.startsWith("."),
    );

    for (const dir of subDirs) {
      const dirPath = join(this.syncPath, dir.name);
      const dirFiles = readdirSync(dirPath)
        .filter((f) => f.endsWith(".md"))
        .map((f) => join(dir.name, f));
      files.push(...dirFiles);
    }

    return files;
  }

  /**
   * Get directory sync status
   */
  async getStatus(): Promise<DirectorySyncStatus> {
    const exists = existsSync(this.syncPath);
    const files: DirectorySyncStatus["files"] = [];
    const stats: DirectorySyncStatus["stats"] = {
      totalFiles: 0,
      byEntityType: {},
    };

    if (exists) {
      const allFiles = this.getAllMarkdownFiles();

      for (const filePath of allFiles) {
        try {
          const fullPath = join(this.syncPath, filePath);
          const fileStat = statSync(fullPath);
          const pathParts = filePath.split("/");
          const entityType =
            pathParts.length > 1 && pathParts[0] ? pathParts[0] : "base";

          files.push({
            path: filePath,
            entityType,
            modified: fileStat.mtime,
          });

          stats.totalFiles++;
          stats.byEntityType[entityType] =
            (stats.byEntityType[entityType] ?? 0) + 1;
        } catch (error) {
          // Skip files that can't be read
          this.logger.debug("Skipping file in status", {
            path: filePath,
            error,
          });
        }
      }
    }

    return {
      syncPath: this.syncPath,
      exists,
      watching: !!this.watcher,
      lastSync: this.lastSync,
      files,
      stats,
    };
  }

  /**
   * Start watching directory for changes
   */
  startWatching(): void {
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
  stopWatching(): void {
    if (this.watcher) {
      void this.watcher.close();
      this.watcher = undefined;
      this.logger.info("Stopped directory watch");
    }
  }

  /**
   * Set watch callback for external handling
   */
  setWatchCallback(callback: (event: string, path: string) => void): void {
    this.watchCallback = callback;

    // If already watching, add the callback
    if (this.watcher) {
      this.watcher.on("all", callback);
    }
  }

  /**
   * Handle file change events
   */
  private async handleFileChange(event: string, path: string): Promise<void> {
    // Only process markdown files
    if (!path.endsWith(".md")) {
      return;
    }

    this.logger.debug("File change detected", { event, path });

    try {
      switch (event) {
        case "add":
        case "change": {
          // Import the changed file
          const relativePath = path.replace(this.syncPath + "/", "");
          await this.importEntities([relativePath]);
          break;
        }

        case "delete":
          // Entity deletion is not handled automatically to prevent data loss
          this.logger.warn("File deleted, manual sync required", { path });
          break;
      }
    } catch (error) {
      this.logger.error("Failed to handle file change", { event, path, error });
    }
  }

  /**
   * Ensure directory structure exists
   */
  async ensureDirectoryStructure(): Promise<void> {
    // Create sync directory if it doesn't exist
    if (!existsSync(this.syncPath)) {
      mkdirSync(this.syncPath, { recursive: true });
    }

    // Create subdirectories for registered entity types
    const entityTypes = this.entityTypes ?? this.entityService.getEntityTypes();
    for (const entityType of entityTypes) {
      if (entityType !== "base") {
        const dir = join(this.syncPath, entityType);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
      }
    }
  }
}
