import {
  assetRefSchema,
  createAssetRef,
  internalFullScope,
  type AssetRef,
  type BaseEntity,
  type IAssetsNamespace,
  type IEntityService,
} from "@brains/plugins";
import { inspectImageBytes } from "@brains/image";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { basename, dirname, extname } from "path";
import { resolveInSyncPath, toSyncRelativePath } from "./path-utils";
import { getMimeTypeForExtension, isImageFile } from "./image-file-utils";
import {
  DOCUMENT_SIDECAR_SUFFIX,
  getDocumentMimeTypeForExtension,
  getDocumentSidecarPath,
  isDocumentFile,
  isDocumentSidecarFile,
} from "./document-file-utils";
import {
  buildEntityFilePath,
  getEntityFileExtension,
  parseEntityPath,
} from "./entity-paths";
import { mkdir, readFile, writeFile, stat, utimes } from "fs/promises";
import { z } from "@brains/utils/zod";
import { computeContentHash } from "@brains/utils/hash";
import type { RawEntity, DirectorySyncStatus } from "../types";
import {
  ensureDirectoryStructure as ensureSyncDirectoryStructure,
  gatherFileStatus as gatherSyncFileStatus,
  getAllMarkdownFiles as findMarkdownFiles,
  getAllSyncFiles as findSyncFiles,
} from "./file-discovery";
import { pathExists } from "./fs-utils";
import {
  DEFAULT_MAX_ASSET_IMPORT_BYTES,
  OversizedImportFileError,
} from "./import-limits";
import {
  DEFAULT_MAX_IMPORT_FILE_BYTES,
  OversizedFileError,
} from "./oversized-file-error";
import type { PendingDeleteTarget } from "./pending-delete-registry";

export { IMAGE_EXTENSIONS, isImageFile } from "./image-file-utils";
export { DOCUMENT_EXTENSIONS, isDocumentFile } from "./document-file-utils";

export type FileOperationsEntityService = Pick<
  IEntityService,
  "serializeEntity" | "hasEntityType" | "getEntity" | "getEntityTypeConfig"
>;

export interface FileOperationsImportLimits {
  maxImportFileBytes: number;
  maxAssetImportBytes: number;
}

const sidecarMetadataSchema = z.record(z.string(), z.unknown());
const MAX_IMAGE_INSPECTION_BYTES = 1024 * 1024;

/**
 * Handles file I/O operations for directory sync
 */
export class FileOperations {
  private readonly syncPath: string;
  private readonly entityService: FileOperationsEntityService;
  private readonly assets: IAssetsNamespace;
  private readonly limits: FileOperationsImportLimits;

  constructor(
    syncPath: string,
    entityService: FileOperationsEntityService,
    assets: IAssetsNamespace,
    limits: FileOperationsImportLimits = {
      maxImportFileBytes: DEFAULT_MAX_IMPORT_FILE_BYTES,
      maxAssetImportBytes: DEFAULT_MAX_ASSET_IMPORT_BYTES,
    },
  ) {
    this.syncPath = syncPath;
    this.entityService = entityService;
    this.assets = assets;
    this.limits = limits;
  }

  parseEntityFromPath(filePath: string): { entityType: string; id: string } {
    return parseEntityPath(this.syncPath, filePath);
  }

  getPendingDeleteTarget(filePath: string): PendingDeleteTarget | undefined {
    const relativePath = toSyncRelativePath(this.syncPath, filePath);
    const entityPath = isDocumentSidecarFile(relativePath)
      ? relativePath.slice(0, -DOCUMENT_SIDECAR_SUFFIX.length)
      : relativePath;
    const { entityType, id } = this.parseEntityFromPath(entityPath);
    if (!this.entityService.hasEntityType(entityType)) return undefined;

    const isSyncFile =
      entityPath.endsWith(".md") ||
      (entityType === "image" && isImageFile(entityPath)) ||
      (entityType === "document" && isDocumentFile(entityPath));
    if (!isSyncFile) return undefined;

    return {
      entityType,
      entityId: id,
      filePath: resolveInSyncPath(this.syncPath, entityPath),
    };
  }

  async readEntity(filePath: string, maxBytes?: number): Promise<RawEntity> {
    const fullPath = resolveInSyncPath(this.syncPath, filePath);

    const stats = await stat(fullPath);
    const { entityType, id } = this.parseEntityFromPath(filePath);

    // Fallback to mtime if birthtime is invalid (zero epoch)
    const created =
      stats.birthtime.getTime() > 0 ? stats.birthtime : stats.mtime;
    const updated = stats.mtime;

    const isAssetBackedImage =
      entityType === "image" &&
      isImageFile(filePath) &&
      this.entityService.getEntityTypeConfig(entityType).binaryStorage ===
        "asset";
    if (isAssetBackedImage) {
      return this.readAssetBackedImage({
        filePath,
        fullPath,
        id,
        created,
        updated,
        sizeBytes: stats.size,
      });
    }

    if (maxBytes !== undefined && stats.size > maxBytes) {
      throw new OversizedFileError(filePath, stats.size, maxBytes);
    }
    this.assertWithinImportLimit(
      filePath,
      stats.size,
      this.limits.maxImportFileBytes,
      "ordinary",
    );

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

  private async readAssetBackedImage(options: {
    filePath: string;
    fullPath: string;
    id: string;
    created: Date;
    updated: Date;
    sizeBytes: number;
  }): Promise<RawEntity> {
    this.assertWithinImportLimit(
      options.filePath,
      options.sizeBytes,
      this.limits.maxAssetImportBytes,
      "asset",
    );

    const existing = await this.entityService.getEntity({
      entityType: "image",
      id: options.id,
      visibilityScope: internalFullScope(
        "directory sync verifies durable images across all visibility tiers",
      ),
      binaryContent: "reference",
      binaryContentSurface: "directory-sync-import",
    });
    const existingRef = assetRefSchema.safeParse(existing?.content.trim());
    const existingAsset = existingRef.success
      ? await this.assets.stat(existingRef.data)
      : null;

    const { ref, metadata } = await this.inspectAssetImageFile(
      options.fullPath,
      options.filePath,
      options.sizeBytes,
    );
    const unchanged = existingRef.success && existingRef.data === ref;

    if (!unchanged || !existingAsset) {
      const stored = await this.putAssetFile(
        options.fullPath,
        options.sizeBytes,
      );
      if (stored.ref !== ref) {
        throw new Error(
          `Image changed while importing ${options.filePath}; expected ${ref} but stored ${stored.ref}`,
        );
      }
    }

    return {
      entityType: "image",
      id: options.id,
      content: ref,
      created: options.created,
      updated: options.updated,
      metadata: { ...existing?.metadata, ...metadata },
      ...(unchanged && { assetUnchanged: true }),
    };
  }

  private async inspectAssetImageFile(
    fullPath: string,
    filePath: string,
    sizeBytes: number,
  ): Promise<{
    ref: AssetRef;
    metadata: Record<string, unknown>;
  }> {
    const hash = createHash("sha256");
    const headerChunks: Buffer[] = [];
    let headerSize = 0;

    for await (const chunk of createReadStream(fullPath)) {
      if (!(chunk instanceof Uint8Array)) {
        throw new TypeError("Image streams must yield Uint8Array chunks");
      }
      hash.update(chunk);
      const remaining = MAX_IMAGE_INSPECTION_BYTES - headerSize;
      if (remaining > 0) {
        const headerChunk = Buffer.from(chunk).subarray(0, remaining);
        headerChunks.push(headerChunk);
        headerSize += headerChunk.byteLength;
      }
    }

    const declaredMediaType = getMimeTypeForExtension(extname(filePath));
    const inspected = inspectImageBytes(
      Buffer.concat(headerChunks, headerSize),
      declaredMediaType,
    );
    return {
      ref: createAssetRef(hash.digest("hex")),
      metadata: {
        format: inspected.format,
        mediaType: inspected.mediaType,
        sizeBytes,
        width: inspected.width,
        height: inspected.height,
      },
    };
  }

  private async putAssetFile(
    fullPath: string,
    expectedSize: number,
  ): Promise<{ ref: AssetRef }> {
    return this.assets.putStream(createReadStream(fullPath), {
      expectedSize,
      maxBytes: this.limits.maxAssetImportBytes,
    });
  }

  private assertWithinImportLimit(
    filePath: string,
    sizeBytes: number,
    maxBytes: number,
    limitKind: "ordinary" | "asset",
  ): void {
    if (sizeBytes > maxBytes) {
      throw new OversizedImportFileError({
        filePath,
        sizeBytes,
        maxBytes,
        limitKind,
      });
    }
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
      const parsed = sidecarMetadataSchema.safeParse(JSON.parse(raw));
      return { ...defaults, ...(parsed.success ? parsed.data : {}) };
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
      let contentToWrite: Uint8Array;
      const assetRef = isImage
        ? assetRefSchema.safeParse(entity.content.trim())
        : undefined;
      if (assetRef?.success) {
        contentToWrite = await this.assets.read(assetRef.data);
      } else {
        const dataUrlPattern = isImage
          ? /^data:image\/[a-z+]+;base64,(.+)$/i
          : /^data:application\/pdf;base64,(.+)$/i;
        const match = entity.content.match(dataUrlPattern);
        const encodedContent = match?.[1];
        if (!encodedContent) {
          throw new Error(
            `Cannot export ${entity.entityType}:${entity.id}: expected a supported base64 data URL or asset reference`,
          );
        }
        contentToWrite = Buffer.from(encodedContent, "base64");
      }

      let binaryUnchanged = false;
      if (await pathExists(filePath)) {
        const currentContent = await readFile(filePath);
        const currentHash = computeContentHash(
          currentContent.toString("base64"),
        );
        const newHash = computeContentHash(
          Buffer.from(contentToWrite).toString("base64"),
        );

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
    if (entity.entityType !== "note") {
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

  getEntityWritePaths(entity: BaseEntity): string[] {
    const filePath = this.getEntityFilePath(entity);
    return entity.entityType === "document"
      ? [filePath, getDocumentSidecarPath(filePath)]
      : [filePath];
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
