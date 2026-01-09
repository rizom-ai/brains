import type { BaseEntity, IEntityService } from "@brains/plugins";
import { join, dirname, extname } from "path";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  utimesSync,
} from "fs";
import { computeContentHash } from "@brains/utils";
import type { RawEntity, DirectorySyncStatus } from "../types";

/**
 * Supported image file extensions
 */
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];

/**
 * Check if a file is an image based on extension
 */
function isImageFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Get MIME type for image extension
 */
function getMimeTypeForExtension(ext: string): string {
  const normalized = ext.toLowerCase().replace(".", "");
  switch (normalized) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return "image/png";
  }
}

/**
 * Get file extension for image format
 */
function getExtensionForFormat(format: string): string {
  switch (format.toLowerCase()) {
    case "jpeg":
      return ".jpg";
    case "svg+xml":
      return ".svg";
    default:
      return `.${format.toLowerCase()}`;
  }
}

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
        // Strip any known extension (.md or image extensions)
        const ext = extname(lastPart).toLowerCase();
        const filename =
          ext === ".md" || IMAGE_EXTENSIONS.includes(ext)
            ? lastPart.slice(0, -ext.length)
            : lastPart;
        idPathParts[idPathParts.length - 1] = filename;
      }
      id = idPathParts.join(":");
    } else {
      // Simple case - just filename, strip extension
      const filename = idPathParts[0] ?? "";
      const ext = extname(filename).toLowerCase();
      id =
        ext === ".md" || IMAGE_EXTENSIONS.includes(ext)
          ? filename.slice(0, -ext.length)
          : filename;
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

    const stats = statSync(fullPath);

    // Parse entity info from path
    const { entityType, id } = this.parseEntityFromPath(filePath);

    // Use file timestamps, but fallback to current time if birthtime is invalid
    const created =
      stats.birthtime.getTime() > 0 ? stats.birthtime : stats.mtime;
    const updated = stats.mtime;

    // Handle image files: read as binary and convert to base64 data URL
    let content: string;
    if (isImageFile(filePath)) {
      const buffer = readFileSync(fullPath);
      const base64 = buffer.toString("base64");
      const ext = extname(filePath);
      const mimeType = getMimeTypeForExtension(ext);
      content = `data:${mimeType};base64,${base64}`;
    } else {
      content = readFileSync(fullPath, "utf-8");
    }

    return {
      entityType,
      id,
      content,
      created,
      updated,
    };
  }

  /**
   * Write entity to file
   * Skips write if serialized content matches current file content
   */
  async writeEntity(entity: BaseEntity): Promise<void> {
    const filePath = this.getEntityFilePath(entity);
    const isImage = entity.entityType === "image";

    // Prepare content to write
    let contentToWrite: Buffer | string;
    if (isImage) {
      const match = entity.content.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
      contentToWrite = match?.[1]
        ? Buffer.from(match[1], "base64")
        : Buffer.from(entity.content, "base64");
    } else {
      contentToWrite = this.entityService.serializeEntity(entity);
    }

    // Skip write if file exists and content matches
    if (existsSync(filePath)) {
      const currentContent = isImage
        ? readFileSync(filePath)
        : readFileSync(filePath, "utf-8");

      const currentHash = computeContentHash(
        isImage
          ? (currentContent as Buffer).toString("base64")
          : (currentContent as string),
      );
      const newHash = computeContentHash(
        isImage
          ? (contentToWrite as Buffer).toString("base64")
          : (contentToWrite as string),
      );

      if (currentHash === newHash) {
        return; // Content matches, skip write
      }
    }

    // Ensure directory exists (only for non-base entities)
    if (entity.entityType !== "base") {
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    // Write the content
    if (isImage) {
      writeFileSync(filePath, contentToWrite as Buffer);
    } else {
      writeFileSync(filePath, contentToWrite as string, "utf-8");
    }

    // Preserve entity timestamps on the file to prevent unnecessary re-syncs
    const updatedTime = new Date(entity.updated);
    utimesSync(filePath, updatedTime, updatedTime);
  }

  /**
   * Get file path for entity by ID, type, and optional extension
   */
  getFilePath(
    entityId: string,
    entityType: string,
    extension: string = ".md",
  ): string {
    // Split ID by colons to create subdirectory structure
    const idParts = entityId.split(":");

    // Filter empty parts but preserve structure
    const cleanParts = idParts.filter((part) => part.length > 0);

    // Base entities go in root, others in type subdirectory
    const isBase = entityType === "base";

    // If only one part (no colons), simple flat file
    if (cleanParts.length === 1) {
      return isBase
        ? join(this.syncPath, `${cleanParts[0]}${extension}`)
        : join(this.syncPath, entityType, `${cleanParts[0]}${extension}`);
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
      return join(this.syncPath, ...directories, `${filename}${extension}`);
    } else {
      return join(
        this.syncPath,
        entityType,
        ...directories,
        `${filename}${extension}`,
      );
    }
  }

  /**
   * Get file path for entity
   */
  getEntityFilePath(entity: BaseEntity): string {
    // Determine file extension based on entity type
    let extension = ".md";
    if (entity.entityType === "image") {
      // Get format from metadata or extract from content data URL
      const format = (entity.metadata as { format?: string }).format;
      if (format) {
        extension = getExtensionForFormat(format);
      } else {
        // Try to extract from data URL
        const match = entity.content.match(/^data:image\/([a-z+]+);base64,/i);
        if (match?.[1]) {
          extension = getExtensionForFormat(match[1]);
        }
      }
    }
    return this.getFilePath(entity.id, entity.entityType, extension);
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
   * Get all syncable files in sync directory (markdown + images in image/ dir)
   */
  getAllSyncFiles(): string[] {
    const files: string[] = [];

    if (!existsSync(this.syncPath)) {
      return files;
    }

    // Recursively find all syncable files
    const findSyncFiles = (
      currentPath: string,
      relativePath: string = "",
      inImageDir: boolean = false,
    ): void => {
      const entries = readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = join(currentPath, entry.name);
        const relativeEntryPath = relativePath
          ? join(relativePath, entry.name)
          : entry.name;

        if (entry.isFile() && !entry.name.endsWith(".invalid")) {
          // Include .md files from anywhere
          if (entry.name.endsWith(".md")) {
            files.push(relativeEntryPath);
          }
          // Include image files only from image/ directory
          else if (inImageDir && isImageFile(entry.name)) {
            files.push(relativeEntryPath);
          }
        } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
          // Track if we're entering the image directory
          const isImageDir = entry.name === "image" && relativePath === "";
          findSyncFiles(entryPath, relativeEntryPath, inImageDir || isImageDir);
        }
      }
    };

    findSyncFiles(this.syncPath);
    return files;
  }

  /**
   * Calculate content hash
   */
  calculateContentHash(content: string): string {
    return computeContentHash(content);
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
   * Uses stored contentHash from existing entity for efficiency
   */
  shouldUpdateEntity(existing: BaseEntity, newEntity: RawEntity): boolean {
    const newHash = this.calculateContentHash(newEntity.content);
    return existing.contentHash !== newHash;
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
        const { entityType } = this.parseEntityFromPath(filePath);

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
