import type { BaseEntity, IEntityService } from "@brains/plugins";
import { dirname, extname } from "path";
import { resolveInSyncPath } from "./path-utils";
import { getMimeTypeForExtension, isImageFile } from "./image-file-utils";
import {
  getDocumentMimeTypeForExtension,
  isDocumentFile,
} from "./document-file-utils";
import {
  buildEntityFilePath,
  getEntityFileExtension,
  parseEntityPath,
} from "./entity-paths";
import { mkdir, readFile, writeFile, stat, utimes } from "fs/promises";
import { computeContentHash } from "@brains/utils/hash";
import type { RawEntity, DirectorySyncStatus } from "../types";
import {
  ensureDirectoryStructure as ensureSyncDirectoryStructure,
  gatherFileStatus as gatherSyncFileStatus,
  getAllMarkdownFiles as findMarkdownFiles,
  getAllSyncFiles as findSyncFiles,
} from "./file-discovery";
import { pathExists } from "./fs-utils";

export { IMAGE_EXTENSIONS, isImageFile } from "./image-file-utils";
export { DOCUMENT_EXTENSIONS, isDocumentFile } from "./document-file-utils";

export type FileOperationsEntityService = Pick<
  IEntityService,
  "serializeEntity" | "hasEntityType"
>;

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
    if (isImageFile(filePath) || isDocumentFile(filePath)) {
      const buffer = await readFile(fullPath);
      const base64 = buffer.toString("base64");
      const ext = extname(filePath);
      const mimeType = isDocumentFile(filePath)
        ? getDocumentMimeTypeForExtension(ext)
        : getMimeTypeForExtension(ext);
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
    const isDocument = entity.entityType === "document";

    if (isImage || isDocument) {
      const dataUrlPattern = isImage
        ? /^data:image\/[a-z+]+;base64,(.+)$/i
        : /^data:application\/pdf;base64,(.+)$/i;
      const match = entity.content.match(dataUrlPattern);
      const contentToWrite = match?.[1]
        ? Buffer.from(match[1], "base64")
        : Buffer.from(entity.content, "base64");

      if (await pathExists(filePath)) {
        const currentContent = await readFile(filePath);
        const currentHash = computeContentHash(
          currentContent.toString("base64"),
        );
        const newHash = computeContentHash(contentToWrite.toString("base64"));

        if (currentHash === newHash) {
          return;
        }
      }

      await this.ensureEntityDirectory(entity, filePath);
      await writeFile(filePath, contentToWrite);
    } else {
      const contentToWrite = this.entityService.serializeEntity(entity);

      if (await pathExists(filePath)) {
        const currentContent = await readFile(filePath, "utf-8");
        const currentHash = computeContentHash(currentContent);
        const newHash = computeContentHash(contentToWrite);

        if (currentHash === newHash) {
          return;
        }
      }

      await this.ensureEntityDirectory(entity, filePath);
      await writeFile(filePath, contentToWrite, "utf-8");
    }

    // Preserve entity timestamps on the file to prevent unnecessary re-syncs
    const updatedTime = new Date(entity.updated);
    await utimes(filePath, updatedTime, updatedTime);
  }

  private async ensureEntityDirectory(
    entity: BaseEntity,
    filePath: string,
  ): Promise<void> {
    if (entity.entityType !== "base") {
      await mkdir(dirname(filePath), { recursive: true });
    }
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
    return findMarkdownFiles(this.syncPath, this.entityService);
  }

  /**
   * Get all syncable files in sync directory (markdown + binary media files)
   */
  async getAllSyncFiles(): Promise<string[]> {
    return findSyncFiles(this.syncPath, this.entityService);
  }

  /**
   * Ensure directory structure exists
   */
  async ensureDirectoryStructure(entityTypes: string[]): Promise<void> {
    await ensureSyncDirectoryStructure(this.syncPath, entityTypes);
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
    return gatherSyncFileStatus(this.syncPath, this.entityService);
  }

  async syncDirectoryExists(): Promise<boolean> {
    return pathExists(this.syncPath);
  }

  async fileExists(filePath: string): Promise<boolean> {
    return pathExists(filePath);
  }
}
