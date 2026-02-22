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

export const IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
];

export function isImageFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

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

  parseEntityFromPath(filePath: string): { entityType: string; id: string } {
    const fullPath = filePath.startsWith(this.syncPath)
      ? filePath
      : join(this.syncPath, filePath);

    const relativePath = fullPath.replace(this.syncPath + "/", "");
    const pathParts = relativePath.split("/");

    // Base entities are in root; subdirectory name is the entity type
    let entityType: string;
    let idPathParts: string[];

    if (pathParts.length === 1) {
      entityType = "base";
      idPathParts = pathParts;
    } else if (pathParts.length > 1 && pathParts[0]) {
      entityType = pathParts[0];
      idPathParts = pathParts.slice(1);
    } else {
      entityType = "base";
      idPathParts = pathParts;
    }

    // Reconstruct ID: nested paths become colon-separated
    // e.g., site-content/landing/hero.md -> id: "landing:hero"
    let id: string;
    if (idPathParts.length > 1) {
      const lastPart = idPathParts[idPathParts.length - 1];
      if (lastPart) {
        const ext = extname(lastPart).toLowerCase();
        const filename =
          ext === ".md" || IMAGE_EXTENSIONS.includes(ext)
            ? lastPart.slice(0, -ext.length)
            : lastPart;
        idPathParts[idPathParts.length - 1] = filename;
      }
      id = idPathParts.join(":");
    } else {
      const filename = idPathParts[0] ?? "";
      const ext = extname(filename).toLowerCase();
      id =
        ext === ".md" || IMAGE_EXTENSIONS.includes(ext)
          ? filename.slice(0, -ext.length)
          : filename;
    }

    return { entityType, id };
  }

  async readEntity(filePath: string): Promise<RawEntity> {
    const fullPath = filePath.startsWith(this.syncPath)
      ? filePath
      : join(this.syncPath, filePath);

    const stats = statSync(fullPath);

    const { entityType, id } = this.parseEntityFromPath(filePath);

    // Fallback to mtime if birthtime is invalid (zero epoch)
    const created =
      stats.birthtime.getTime() > 0 ? stats.birthtime : stats.mtime;
    const updated = stats.mtime;

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

    let contentToWrite: Buffer | string;
    if (isImage) {
      const match = entity.content.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
      contentToWrite = match?.[1]
        ? Buffer.from(match[1], "base64")
        : Buffer.from(entity.content, "base64");
    } else {
      contentToWrite = this.entityService.serializeEntity(entity);
    }

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
        return;
      }
    }

    if (entity.entityType !== "base") {
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    if (isImage) {
      writeFileSync(filePath, contentToWrite as Buffer);
    } else {
      writeFileSync(filePath, contentToWrite as string, "utf-8");
    }

    // Preserve entity timestamps on the file to prevent unnecessary re-syncs
    const updatedTime = new Date(entity.updated);
    utimesSync(filePath, updatedTime, updatedTime);
  }

  getFilePath(
    entityId: string,
    entityType: string,
    extension: string = ".md",
  ): string {
    const cleanParts = entityId.split(":").filter((part) => part.length > 0);
    const isBase = entityType === "base";

    if (cleanParts.length === 1) {
      return isBase
        ? join(this.syncPath, `${cleanParts[0]}${extension}`)
        : join(this.syncPath, entityType, `${cleanParts[0]}${extension}`);
    }

    // Skip first part if it duplicates the entity type (e.g., "summary/summary/...")
    let pathParts = cleanParts;
    if (cleanParts[0] === entityType) {
      pathParts = cleanParts.slice(1);
    }

    const filename = pathParts[pathParts.length - 1];
    const directories = pathParts.slice(0, -1);

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

  getEntityFilePath(entity: BaseEntity): string {
    let extension = ".md";
    if (entity.entityType === "image") {
      const format = (entity.metadata as { format?: string }).format;
      if (format) {
        extension = getExtensionForFormat(format);
      } else {
        const match = entity.content.match(/^data:image\/([a-z+]+);base64,/i);
        if (match?.[1]) {
          extension = getExtensionForFormat(match[1]);
        }
      }
    }
    return this.getFilePath(entity.id, entity.entityType, extension);
  }

  getAllMarkdownFiles(): string[] {
    return this.findFiles({ includeImages: false });
  }

  /**
   * Get all syncable files in sync directory (markdown + images in image/ dir)
   */
  getAllSyncFiles(): string[] {
    return this.findFiles({ includeImages: true });
  }

  private findFiles(opts: { includeImages: boolean }): string[] {
    const files: string[] = [];
    if (!existsSync(this.syncPath)) return files;

    const walk = (
      currentPath: string,
      relativePath: string = "",
      inImageDir: boolean = false,
    ): void => {
      const entries = readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = join(currentPath, entry.name);
        const rel = relativePath ? join(relativePath, entry.name) : entry.name;

        if (entry.isFile() && !entry.name.endsWith(".invalid")) {
          if (entry.name.endsWith(".md")) {
            files.push(rel);
          } else if (
            opts.includeImages &&
            inImageDir &&
            isImageFile(entry.name)
          ) {
            files.push(rel);
          }
        } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
          const isImgDir = entry.name === "image" && relativePath === "";
          walk(entryPath, rel, inImageDir || isImgDir);
        }
      }
    };

    walk(this.syncPath);
    return files;
  }

  /**
   * Ensure directory structure exists
   */
  async ensureDirectoryStructure(entityTypes: string[]): Promise<void> {
    if (!existsSync(this.syncPath)) {
      mkdirSync(this.syncPath, { recursive: true });
    }

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
    const newHash = computeContentHash(newEntity.content);
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

  syncDirectoryExists(): boolean {
    return existsSync(this.syncPath);
  }

  fileExists(filePath: string): boolean {
    return existsSync(filePath);
  }
}
