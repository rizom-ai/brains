import type { BaseEntity, IEntityService } from "@brains/plugins";
import { join, basename, dirname } from "path";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  utimesSync,
} from "fs";
import { createHash } from "crypto";
import type { RawEntity, DirectorySyncStatus } from "../types";

/**
 * Handles file I/O operations for directory sync
 */
export class FileOperations {
  private readonly syncPath: string;
  private readonly entityService: IEntityService;

  constructor(syncPath: string, entityService: IEntityService) {
    this.syncPath = syncPath;
    this.entityService = entityService;
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

    // Preserve entity timestamps on the file to prevent unnecessary re-syncs
    const updatedTime = new Date(entity.updated);
    utimesSync(filePath, updatedTime, updatedTime);
  }

  /**
   * Get file path for entity
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
  getAllMarkdownFiles(): string[] {
    const files: string[] = [];

    if (!existsSync(this.syncPath)) {
      return files;
    }

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
   * Calculate content hash
   */
  calculateContentHash(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Ensure directory structure exists
   */
  async ensureDirectoryStructure(entityTypes: string[]): Promise<void> {
    // Create sync directory if it doesn't exist
    if (!existsSync(this.syncPath)) {
      mkdirSync(this.syncPath, { recursive: true });
    }

    // Create subdirectories for registered entity types
    for (const entityType of entityTypes) {
      if (entityType !== "base") {
        const dir = join(this.syncPath, entityType);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
      }
    }
  }

  /**
   * Check if entity should be updated based on content hash
   */
  shouldUpdateEntity(existing: BaseEntity, newEntity: RawEntity): boolean {
    const existingHash = this.calculateContentHash(existing.content);
    const newHash = this.calculateContentHash(newEntity.content);
    return existingHash !== newHash;
  }

  /**
   * Gather file status information for directory sync status
   */
  gatherFileStatus(): {
    files: DirectorySyncStatus["files"];
    stats: DirectorySyncStatus["stats"];
  } {
    const files: DirectorySyncStatus["files"] = [];
    const stats: DirectorySyncStatus["stats"] = {
      totalFiles: 0,
      byEntityType: {},
    };

    if (!existsSync(this.syncPath)) {
      return { files, stats };
    }

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
      } catch {
        // Skip files that can't be read
        continue;
      }
    }

    return { files, stats };
  }

  /**
   * Check if sync directory exists
   */
  syncDirectoryExists(): boolean {
    return existsSync(this.syncPath);
  }
}
