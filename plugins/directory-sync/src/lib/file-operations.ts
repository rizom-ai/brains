import type { BaseEntity } from "@brains/plugins";
import { join, dirname, extname } from "path";
import { resolveInSyncPath } from "./path-utils";
import { getMimeTypeForExtension, isImageFile } from "./image-file-utils";
import {
  buildEntityFilePath,
  getEntityFileExtension,
  parseEntityPath,
} from "./entity-paths";
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  stat,
  utimes,
  access,
} from "fs/promises";
import { computeContentHash } from "@brains/utils/hash";
import type { RawEntity, DirectorySyncStatus } from "../types";

export { IMAGE_EXTENSIONS, isImageFile } from "./image-file-utils";

/**
 * Check if a path exists (async replacement for existsSync)
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export interface FileOperationsEntityService {
  serializeEntity(entity: BaseEntity): string;
  hasEntityType(type: string): boolean;
}

/**
 * Handles file I/O operations for directory sync
 */
export class FileOperations {
  private readonly syncPath: string;
  private readonly entityService: FileOperationsEntityService;

  constructor(syncPath: string, entityService: FileOperationsEntityService) {
    this.syncPath = syncPath;
    this.entityService = entityService;
  }

  parseEntityFromPath(filePath: string): { entityType: string; id: string } {
    return parseEntityPath(this.syncPath, filePath);
  }

  async readEntity(filePath: string): Promise<RawEntity> {
    const fullPath = resolveInSyncPath(this.syncPath, filePath);

    const stats = await stat(fullPath);

    const { entityType, id } = this.parseEntityFromPath(filePath);

    // Fallback to mtime if birthtime is invalid (zero epoch)
    const created =
      stats.birthtime.getTime() > 0 ? stats.birthtime : stats.mtime;
    const updated = stats.mtime;

    let content: string;
    if (isImageFile(filePath)) {
      const buffer = await readFile(fullPath);
      const base64 = buffer.toString("base64");
      const ext = extname(filePath);
      const mimeType = getMimeTypeForExtension(ext);
      content = `data:${mimeType};base64,${base64}`;
    } else {
      content = await readFile(fullPath, "utf-8");
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

    if (await pathExists(filePath)) {
      const currentContent = isImage
        ? await readFile(filePath)
        : await readFile(filePath, "utf-8");

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
      await mkdir(dirname(filePath), { recursive: true });
    }

    if (isImage) {
      await writeFile(filePath, contentToWrite as Buffer);
    } else {
      await writeFile(filePath, contentToWrite as string, "utf-8");
    }

    // Preserve entity timestamps on the file to prevent unnecessary re-syncs
    const updatedTime = new Date(entity.updated);
    await utimes(filePath, updatedTime, updatedTime);
  }

  getFilePath(
    entityId: string,
    entityType: string,
    extension: string = ".md",
  ): string {
    return buildEntityFilePath(this.syncPath, entityId, entityType, extension);
  }

  getEntityFilePath(entity: BaseEntity): string {
    return this.getFilePath(
      entity.id,
      entity.entityType,
      getEntityFileExtension(entity),
    );
  }

  async getAllMarkdownFiles(): Promise<string[]> {
    return this.findFiles({ includeImages: false });
  }

  /**
   * Get all syncable files in sync directory (markdown + images in image/ dir)
   */
  async getAllSyncFiles(): Promise<string[]> {
    return this.findFiles({ includeImages: true });
  }

  private async findFiles(opts: { includeImages: boolean }): Promise<string[]> {
    const files: string[] = [];
    if (!(await pathExists(this.syncPath))) return files;

    const walk = async (
      currentPath: string,
      relativePath: string = "",
      inImageDir: boolean = false,
    ): Promise<void> => {
      const entries = await readdir(currentPath, { withFileTypes: true });
      for (const entry of entries) {
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
          // At root level, only walk into registered entity type directories
          if (
            relativePath === "" &&
            !this.entityService.hasEntityType(entry.name)
          ) {
            continue;
          }
          const entryPath = join(currentPath, entry.name);
          const isImgDir = entry.name === "image" && relativePath === "";
          await walk(entryPath, rel, inImageDir || isImgDir);
        }
      }
    };

    await walk(this.syncPath);
    return files;
  }

  /**
   * Ensure directory structure exists
   */
  async ensureDirectoryStructure(entityTypes: string[]): Promise<void> {
    if (!(await pathExists(this.syncPath))) {
      await mkdir(this.syncPath, { recursive: true });
    }

    for (const entityType of entityTypes) {
      if (entityType !== "base") {
        await mkdir(join(this.syncPath, entityType), { recursive: true });
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
  async gatherFileStatus(): Promise<{
    files: DirectorySyncStatus["files"];
    stats: DirectorySyncStatus["stats"];
  }> {
    const files: DirectorySyncStatus["files"] = [];
    const stats: DirectorySyncStatus["stats"] = {
      totalFiles: 0,
      byEntityType: {},
    };

    if (!(await pathExists(this.syncPath))) {
      return { files, stats };
    }

    const allFiles = await this.getAllMarkdownFiles();

    for (const filePath of allFiles) {
      try {
        const fullPath = join(this.syncPath, filePath);
        const fileStat = await stat(fullPath);
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

  async syncDirectoryExists(): Promise<boolean> {
    return pathExists(this.syncPath);
  }

  async fileExists(filePath: string): Promise<boolean> {
    return pathExists(filePath);
  }
}
