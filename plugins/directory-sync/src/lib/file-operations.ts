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
   * Parse entity info from file path
   * Extracts entity type and ID from the file path structure
   */
  parseEntityFromPath(filePath: string): { entityType: string; id: string } {
    const fullPath = filePath.startsWith(this.syncPath)
      ? filePath
      : join(this.syncPath, filePath);

    // Determine entity type from path
    const relativePath = fullPath.replace(this.syncPath + "/", "");
    const pathParts = relativePath.split("/");

    // Check if first part is a known entity type directory
    // Base entities are in root, so if there's only one part or
    // the first part isn't a directory, it's a base entity
    let entityType: string;
    let idPathParts: string[];

    if (pathParts.length === 1) {
      // File in root - it's a base entity
      entityType = "base";
      idPathParts = pathParts;
    } else if (pathParts.length > 1 && pathParts[0]) {
      // Multiple parts means first part is a directory (entity type)
      // even if it has .md in the name (edge case)
      entityType = pathParts[0];
      idPathParts = pathParts.slice(1);
    } else {
      // Fallback: treat as base entity
      entityType = "base";
      idPathParts = pathParts;
    }

    // Reconstruct ID from path with colons for nested structures
    // e.g., site-content/landing/hero.md -> id: "landing:hero"
    let id: string;
    if (idPathParts.length > 1) {
      // Has subdirectories - join with colons
      const lastPart = idPathParts[idPathParts.length - 1];
      if (lastPart) {
        const filename = lastPart.replace(".md", "");
        idPathParts[idPathParts.length - 1] = filename;
      }
      id = idPathParts.join(":");
    } else {
      // Simple case - just filename
      id = basename(idPathParts[0] ?? "", ".md");
    }

    return { entityType, id };
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

    // Parse entity info from path
    const { entityType, id } = this.parseEntityFromPath(filePath);

    // Use file timestamps, but fallback to current time if birthtime is invalid
    const created =
      stats.birthtime.getTime() > 0 ? stats.birthtime : stats.mtime;
    const updated = stats.mtime;

    return {
      entityType,
      id,
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
   * Get file path for entity by ID and type
   */
  getFilePath(entityId: string, entityType: string): string {
    // Split ID by colons to create subdirectory structure
    const idParts = entityId.split(":");

    // Filter empty parts but preserve structure
    const cleanParts = idParts.filter((part) => part.length > 0);

    // Base entities go in root, others in type subdirectory
    const isBase = entityType === "base";

    // If only one part (no colons), simple flat file
    if (cleanParts.length === 1) {
      return isBase
        ? join(this.syncPath, `${cleanParts[0]}.md`)
        : join(this.syncPath, entityType, `${cleanParts[0]}.md`);
    }

    // For multiple parts, check if first part matches entity type
    // If it does, skip it to avoid duplication like "summary/summary/..."
    let pathParts = cleanParts;
    if (cleanParts[0] === entityType) {
      pathParts = cleanParts.slice(1);
    }

    // Last part becomes the filename
    const filename = pathParts[pathParts.length - 1];
    const directories = pathParts.slice(0, -1);

    // Build path - base entities in root, others in type subdirectory
    if (isBase) {
      return join(this.syncPath, ...directories, `${filename}.md`);
    } else {
      return join(this.syncPath, entityType, ...directories, `${filename}.md`);
    }
  }

  /**
   * Get file path for entity
   */
  getEntityFilePath(entity: BaseEntity): string {
    return this.getFilePath(entity.id, entity.entityType);
  }

  /**
   * Get all markdown files in sync directory
   */
  getAllMarkdownFiles(): string[] {
    const files: string[] = [];

    if (!existsSync(this.syncPath)) {
      return files;
    }

    // Recursively find all markdown files
    const findMarkdownFiles = (
      currentPath: string,
      relativePath: string = "",
    ): void => {
      const entries = readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = join(currentPath, entry.name);
        const relativeEntryPath = relativePath
          ? join(relativePath, entry.name)
          : entry.name;

        if (
          entry.isFile() &&
          entry.name.endsWith(".md") &&
          !entry.name.endsWith(".invalid")
        ) {
          files.push(relativeEntryPath);
        } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
          findMarkdownFiles(entryPath, relativeEntryPath);
        }
      }
    };

    findMarkdownFiles(this.syncPath);
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

  /**
   * Check if a file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    return existsSync(filePath);
  }
}
