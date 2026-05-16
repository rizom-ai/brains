import type { BaseEntity, IEntityService } from "@brains/plugins";
import { basename, dirname, extname } from "path";
import { resolveInSyncPath } from "./path-utils";
import { getMimeTypeForExtension, isImageFile } from "./image-file-utils";
import {
  getDocumentMimeTypeForExtension,
  getDocumentSidecarPath,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
    let metadata: Record<string, unknown> | undefined;
    if (isImageFile(filePath) || isDocumentFile(filePath)) {
      const buffer = await readFile(fullPath);
      const base64 = buffer.toString("base64");
      const ext = extname(filePath);
      const mimeType = isDocumentFile(filePath)
        ? getDocumentMimeTypeForExtension(ext)
        : getMimeTypeForExtension(ext);
      content = `data:${mimeType};base64,${base64}`;
      if (isDocumentFile(filePath)) {
        metadata = await this.readDocumentSidecar(fullPath, filePath);
      }
    } else {
      content = await readFile(fullPath, "utf-8");
    }

    const result: RawEntity = {
      entityType,
      id,
      content,
      created,
      updated,
    };
    if (metadata) {
      result.metadata = metadata;
    }
    return result;
  }

  /**
   * Read the sidecar JSON for a document file. Returns metadata enriched with
   * a `filename` derived from the file path (acts as a default for documents
   * dropped in by hand without a sidecar) so the document schema's required
   * filename always has a value.
   */
  private async readDocumentSidecar(
    fullPdfPath: string,
    relativePath: string,
  ): Promise<Record<string, unknown>> {
    const defaults: Record<string, unknown> = {
      mimeType: "application/pdf",
      filename: basename(relativePath),
    };
    const sidecarPath = getDocumentSidecarPath(fullPdfPath);

    if (!(await pathExists(sidecarPath))) {
      return defaults;
    }

    try {
      const raw = await readFile(sidecarPath, "utf-8");
      const parsed: unknown = JSON.parse(raw);
      const fromSidecar = isRecord(parsed) ? parsed : {};
      return { ...defaults, ...fromSidecar };
    } catch {
      // Corrupt sidecar shouldn't block import; the schema will still pass
      // because filename + mimeType come from defaults.
      return defaults;
    }
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

      let binaryUnchanged = false;
      if (await pathExists(filePath)) {
        const currentContent = await readFile(filePath);
        const currentHash = computeContentHash(
          currentContent.toString("base64"),
        );
        const newHash = computeContentHash(contentToWrite.toString("base64"));

        if (currentHash === newHash) {
          binaryUnchanged = true;
        }
      }

      if (!binaryUnchanged) {
        await this.ensureEntityDirectory(entity, filePath);
        await writeFile(filePath, contentToWrite);
      }

      if (isDocument) {
        await this.writeDocumentSidecar(entity, filePath);
      }

      if (binaryUnchanged) {
        return;
      }
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

  /**
   * Persist document metadata that does not survive in the PDF bytes
   * (filename, page count, dedup key, source provenance) in a sidecar JSON
   * file. `mimeType` is omitted because it is implicit in the .pdf extension
   * and would be regenerated from the data URL on read.
   */
  private async writeDocumentSidecar(
    entity: BaseEntity,
    pdfPath: string,
  ): Promise<void> {
    const metadata = entity.metadata;
    const persistable: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (key === "mimeType") continue;
      if (value === undefined) continue;
      persistable[key] = value;
    }

    const sidecarPath = getDocumentSidecarPath(pdfPath);
    const serialized = `${JSON.stringify(persistable, null, 2)}\n`;

    if (await pathExists(sidecarPath)) {
      const existing = await readFile(sidecarPath, "utf-8");
      if (existing === serialized) {
        return;
      }
    }

    await this.ensureEntityDirectory(entity, sidecarPath);
    await writeFile(sidecarPath, serialized, "utf-8");
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
