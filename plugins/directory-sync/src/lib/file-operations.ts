import type { ServiceEntityMirrorClient } from "@brains/sdk/internal/service-runtime";
import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import { createHash } from "node:crypto";
import { basename, dirname, extname } from "path";
import { resolveInSyncPath, toSyncRelativePath } from "./path-utils";
import {
  getMimeTypeForExtension,
  IMAGE_EXTENSIONS,
  isImageFile,
} from "./image-file-utils";
import {
  DOCUMENT_SIDECAR_SUFFIX,
  getDocumentMimeTypeForExtension,
  getDocumentSidecarPath,
  isDocumentFile,
  isDocumentSidecarFile,
} from "./document-file-utils";
import {
  buildEntityFilePath,
  containmentOf,
  getEntityFileExtension,
  parseEntityPath,
  resolveEntityPlacement,
  type Containment,
} from "./entity-paths";
import { EntityPlacementError } from "./entity-placement-error";
import {
  mkdir,
  open,
  readFile,
  rename,
  rmdir,
  unlink,
  stat,
  utimes,
} from "fs/promises";
import {
  atomicWriteTempPath,
  moveFileWithoutReplacing,
  writeFileAtomic,
} from "./atomic-write";
import { z } from "@brains/utils/zod";
import { computeContentHash } from "@brains/utils/hash";
import {
  assetRefSchema,
  computeAssetDigest,
  getAssetDigest,
  readAssetBytes,
  type AssetRef,
} from "@brains/sdk/internal/service-runtime";
import type { RawEntity, DirectorySyncStatus } from "../types";
import {
  ensureDirectoryStructure as ensureSyncDirectoryStructure,
  gatherFileStatus as gatherSyncFileStatus,
  getAllMarkdownFiles as findMarkdownFiles,
  getAllSyncFiles as findSyncFiles,
} from "./file-discovery";
import { pathExists } from "./fs-utils";
import { OversizedFileError } from "./oversized-file-error";
import type { PendingDeleteTarget } from "./pending-delete-registry";

export { IMAGE_EXTENSIONS, isImageFile } from "./image-file-utils";
export { DOCUMENT_EXTENSIONS, isDocumentFile } from "./document-file-utils";

export type FileOperationsEntityService = Pick<
  ServiceEntityMirrorClient,
  | "serializeEntity"
  | "hasEntityType"
  | "getEntityTypes"
  | "getEntityTypeConfig"
  | "openAsset"
>;

const sidecarMetadataSchema = z.record(z.string(), z.unknown());

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
    return parseEntityPath(this.syncPath, filePath, this.containment());
  }

  /**
   * Where a contained type's file belongs when it sits outside its
   * container's folder: `book-section/zara/x.md` reads as the section that
   * lives at `book/zara/x.md`. Undefined for a file already in place, a type
   * that is not contained, or a placement refused for its ID.
   */
  getMisplacedContainedPath(filePath: string): string | undefined {
    const containment = this.containment();
    const { entityType, id } = this.parseEntityFromPath(filePath);
    if (!containment.has(entityType)) return undefined;
    const placement = resolveEntityPlacement(
      entityType,
      id,
      extname(filePath),
      containment,
    );
    return placement.writable &&
      placement.relativePath !== toSyncRelativePath(this.syncPath, filePath)
      ? placement.relativePath
      : undefined;
  }

  /**
   * Move a file to the path it belongs at, then drop the folders it leaves
   * empty. False, with nothing moved, when that path already holds a file.
   */
  async moveEntityFile(filePath: string, targetPath: string): Promise<boolean> {
    const source = resolveInSyncPath(this.syncPath, filePath);
    const moved = await moveFileWithoutReplacing(
      source,
      resolveInSyncPath(this.syncPath, targetPath),
    );
    if (moved) await this.removeEmptyFolders(dirname(source));
    return moved;
  }

  /** Remove a folder inside the sync path and each parent it leaves empty. */
  private async removeEmptyFolders(folder: string): Promise<void> {
    const relativeFolder = toSyncRelativePath(this.syncPath, folder);
    if (relativeFolder === "" || relativeFolder.startsWith("..")) return;
    const removed = await rmdir(folder).then(
      () => true,
      () => false,
    );
    if (removed) await this.removeEmptyFolders(dirname(folder));
  }

  /** Where contained types live, as the registry holds it now. */
  private containment(): Containment {
    return containmentOf(this.entityService);
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

  /** An entity file's identity, size and timestamps, without reading it. */
  async statEntityFile(
    filePath: string,
    maxBytes?: number,
  ): Promise<EntityFileStat> {
    const fullPath = resolveInSyncPath(this.syncPath, filePath);

    const stats = await stat(fullPath);
    if (maxBytes !== undefined && stats.size > maxBytes) {
      throw new OversizedFileError(filePath, stats.size, maxBytes);
    }

    const { entityType, id } = this.parseEntityFromPath(filePath);
    return {
      fullPath,
      entityType,
      id,
      sizeBytes: stats.size,
      // Fallback to mtime if birthtime is invalid (zero epoch)
      created: stats.birthtime.getTime() > 0 ? stats.birthtime : stats.mtime,
      updated: stats.mtime,
    };
  }

  async readEntity(filePath: string, maxBytes?: number): Promise<RawEntity> {
    const { fullPath, entityType, id, created, updated } =
      await this.statEntityFile(filePath, maxBytes);

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
      const parsed = sidecarMetadataSchema.safeParse(JSON.parse(raw));
      return { ...defaults, ...(parsed.success ? parsed.data : {}) };
    } catch {
      // Corrupt sidecar shouldn't block import; the schema will still pass
      // because filename + mimeType come from defaults.
      return defaults;
    }
  }

  /** Shared pure admission for automatic/manual exports and orphan cleanup. */
  assertEntityPlacement(entity: BaseEntity): void {
    this.assertPlacement(
      entity.entityType,
      entity.id,
      getEntityFileExtension(entity),
    );
  }

  private assertPlacement(
    entityType: string,
    entityId: string,
    extension: string,
  ): void {
    const placement = resolveEntityPlacement(
      entityType,
      entityId,
      extension,
      this.containment(),
    );
    if (!placement.writable) {
      throw new EntityPlacementError(
        entityType,
        entityId,
        placement.relativePath,
        placement.owner,
      );
    }
  }

  /**
   * Write entity to file
   * Skips write if serialized content matches current file content
   */
  async writeEntity(entity: BaseEntity): Promise<void> {
    this.assertEntityPlacement(entity);
    const filePath = await this.resolveEntityFilePath(entity);
    const isImage = entity.entityType === "image";
    const isDocument = entity.entityType === "document";

    // A pending or failed binary has no bytes to mirror yet. Its current file,
    // if any, stays until the bytes it is waiting for replace it.
    if ((isImage || isDocument) && entity.content === "") return;

    // The durable outbox keeps only the latest mutation per (type, id).
    // Image extensions are content-derived, so converge that stable namespace
    // by removing every obsolete representation before writing the latest one.
    if (isImage) {
      await Promise.all(
        this.getEntityDeletePaths(entity.entityType, entity.id)
          .filter((candidate) => candidate !== filePath)
          .map(async (candidate) => {
            try {
              await unlink(candidate);
            } catch (error) {
              if (
                typeof error === "object" &&
                error !== null &&
                "code" in error &&
                error.code === "ENOENT"
              ) {
                return;
              }
              throw error;
            }
          }),
      );
      // A markdown file keeps the data URL as text, whatever its format.
      if (filePath.endsWith(".md")) {
        await this.writeImageMarkdown(entity, filePath);
        return;
      }
    }

    const assetRef = assetRefSchema.safeParse(entity.content);
    if (assetRef.success) {
      // Stored assets stream to the file; an identical file is left alone.
      if (
        (await pathExists(filePath)) &&
        (await fileDigest(filePath)) === getAssetDigest(assetRef.data)
      ) {
        return;
      }
      await this.ensureEntityDirectory(filePath);
      await writeChunks(
        filePath,
        await this.entityService.openAsset(assetRef.data),
      );
      if (isDocument) {
        await this.writeDocumentSidecar(entity, filePath);
      }
    } else if (isImage || isDocument) {
      // Text-form files leave a trailing newline, and payloads may wrap.
      const dataUrlPattern = isImage
        ? /^data:image\/[a-z0-9.+-]+;base64,([\s\S]+)$/i
        : /^data:application\/pdf;base64,([\s\S]+)$/i;
      const payload = dataUrlPattern.exec(entity.content.trim())?.[1];
      // Never decode anything else as base64: that silently drops the
      // non-base64 characters and writes garbage the next import keeps.
      if (!payload) {
        throw new Error(
          `Refusing to export ${entity.entityType}:${entity.id}: content is not a base64 data URL`,
        );
      }
      const contentToWrite = Buffer.from(payload.replace(/\s/g, ""), "base64");

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
        await this.ensureEntityDirectory(filePath);
        await writeFileAtomic(filePath, contentToWrite);
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

      await this.ensureEntityDirectory(filePath);
      await writeFileAtomic(filePath, contentToWrite);
    }

    // Preserve entity timestamps on the file to prevent unnecessary re-syncs
    const updatedTime = new Date(entity.updated);
    await utimes(filePath, updatedTime, updatedTime);
  }

  /** Write an image's data URL as the text of its markdown file. */
  /** A stored asset as the data URL a markdown image file holds. */
  private async assetDataUrl(
    entity: BaseEntity,
    ref: AssetRef,
  ): Promise<string> {
    const bytes = await readAssetBytes(this.entityService, ref);
    const recorded = entity.metadata["mediaType"];
    const format = entity.metadata["format"];
    const subtype = typeof format === "string" ? format : "png";
    const mediaType =
      typeof recorded === "string"
        ? recorded
        : `image/${subtype === "jpg" ? "jpeg" : subtype}`;
    return `data:${mediaType};base64,${bytes.toString("base64")}`;
  }

  private async writeImageMarkdown(
    entity: BaseEntity,
    filePath: string,
  ): Promise<void> {
    const assetRef = assetRefSchema.safeParse(entity.content);
    const current = (await pathExists(filePath))
      ? await readFile(filePath, "utf-8")
      : undefined;
    if (assetRef.success) {
      // The file is its bytes: one that decodes to the stored asset is left
      // byte for byte, however its data URL is wrapped.
      if (
        current !== undefined &&
        dataUrlDigest(current) === getAssetDigest(assetRef.data)
      ) {
        return;
      }
    } else if (current === entity.content) {
      return;
    }
    const text = assetRef.success
      ? await this.assetDataUrl(entity, assetRef.data)
      : entity.content;
    await this.ensureEntityDirectory(filePath);
    await writeFileAtomic(filePath, text);
    const updatedTime = new Date(entity.updated);
    await utimes(filePath, updatedTime, updatedTime);
  }

  private async ensureEntityDirectory(filePath: string): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
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

    await this.ensureEntityDirectory(sidecarPath);
    await writeFileAtomic(sidecarPath, serialized);
  }

  getFilePath(
    entityId: string,
    entityType: string,
    extension: string = ".md",
  ): string {
    return buildEntityFilePath(
      this.syncPath,
      entityId,
      entityType,
      extension,
      this.containment(),
    );
  }

  getEntityFilePath(entity: BaseEntity): string {
    return this.getFilePath(
      entity.id,
      entity.entityType,
      getEntityFileExtension(entity),
    );
  }

  /**
   * The paths an entity's file may have, the one its content names first.
   * An image may also be a markdown file holding its data URL, whatever the
   * format its bytes say.
   */
  getEntityFileCandidates(entity: BaseEntity): string[] {
    const filePath = this.getEntityFilePath(entity);
    if (entity.entityType !== "image") return [filePath];
    const markdownPath = this.getFilePath(entity.id, entity.entityType, ".md");
    return filePath === markdownPath ? [filePath] : [filePath, markdownPath];
  }

  /** The entity's file: the first candidate on disk, else the one its content names. */
  async resolveEntityFilePath(entity: BaseEntity): Promise<string> {
    const candidates = this.getEntityFileCandidates(entity);
    const present = await Promise.all(candidates.map(pathExists));
    return (
      candidates.find((_, index) => present[index]) ??
      this.getEntityFilePath(entity)
    );
  }

  getEntityWritePaths(entity: BaseEntity): string[] {
    const filePath = this.getEntityFilePath(entity);
    return entity.entityType === "document"
      ? [filePath, getDocumentSidecarPath(filePath)]
      : [filePath];
  }

  /** Every path that may change while converging the latest entity revision. */
  getEntityConvergencePaths(entity: BaseEntity): string[] {
    return entity.entityType === "image"
      ? this.getEntityDeletePaths(entity.entityType, entity.id)
      : this.getEntityWritePaths(entity);
  }

  getEntityDeletePaths(entityType: string, entityId: string): string[] {
    if (entityType === "document") {
      const filePath = this.getFilePath(entityId, entityType, ".pdf");
      return [filePath, getDocumentSidecarPath(filePath)];
    }
    const extensions =
      entityType === "image" ? [...IMAGE_EXTENSIONS, ".md"] : [".md"];
    return extensions.map((extension) =>
      this.getFilePath(entityId, entityType, extension),
    );
  }

  async deleteEntityFiles(entityType: string, entityId: string): Promise<void> {
    this.assertPlacement(
      entityType,
      entityId,
      entityType === "document"
        ? ".pdf"
        : entityType === "image"
          ? (IMAGE_EXTENSIONS[0] ?? ".md")
          : ".md",
    );
    await Promise.all(
      this.getEntityDeletePaths(entityType, entityId).map(async (filePath) => {
        try {
          await unlink(filePath);
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "ENOENT"
          ) {
            return;
          }
          throw error;
        }
      }),
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
    // A contained type lives in its container's folder, not one of its own.
    const containment = this.containment();
    await ensureSyncDirectoryStructure(
      this.syncPath,
      entityTypes.filter((type) => !containment.has(type)),
    );
  }

  /**
   * Check if entity should be updated based on content hash
   * Uses stored contentHash from existing entity for efficiency
   */
  shouldUpdateEntity(existing: BaseEntity, newEntity: RawEntity): boolean {
    // An image is its bytes: a file whose data URL decodes to the bytes the
    // row stores, as an asset or inline, is unchanged however it is wrapped.
    const assetBacked =
      this.entityService.getEntityTypeConfig(existing.entityType)
        .binaryStorage === "asset";
    const stored = assetBacked
      ? storedBytesDigest(existing.content)
      : undefined;
    if (stored !== undefined) {
      const file = dataUrlDigest(newEntity.content);
      return file === undefined || file !== stored;
    }
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
    return gatherSyncFileStatus(
      this.syncPath,
      this.entityService,
      this.containment(),
    );
  }

  async syncDirectoryExists(): Promise<boolean> {
    return pathExists(this.syncPath);
  }

  async fileExists(filePath: string): Promise<boolean> {
    return pathExists(filePath);
  }
}

/** An entity file's identity, size and timestamps. */
export interface EntityFileStat {
  fullPath: string;
  entityType: string;
  id: string;
  sizeBytes: number;
  created: Date;
  updated: Date;
}

/** A file's SHA-256, hashed as a stream so its size never stalls a read. */
export async function fileDigest(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of Bun.file(filePath).stream()) hash.update(chunk);
  return hash.digest("hex");
}

const DATA_URL_PAYLOAD = /^data:[^;,]+;base64,([\s\S]*)$/;

/**
 * The SHA-256 of the bytes a base64 data URL holds, however its payload is
 * wrapped; undefined for anything else.
 */
function dataUrlDigest(content: string): string | undefined {
  const payload = DATA_URL_PAYLOAD.exec(content.trim())?.[1]?.replace(
    /\s/g,
    "",
  );
  return payload
    ? computeAssetDigest(Buffer.from(payload, "base64"))
    : undefined;
}

/** The digest of the bytes a row stores: its asset's, or its inline data URL's. */
function storedBytesDigest(content: string): string | undefined {
  const ref = assetRefSchema.safeParse(content);
  return ref.success ? getAssetDigest(ref.data) : dataUrlDigest(content);
}

/**
 * Stream chunks into a hidden temporary file beside the target, then rename
 * it over the target: a failed stream or a crash never leaves a truncated
 * file for the next import to take as new bytes. The temporary file is the
 * one `writeFileAtomic` uses, so sync and the Git exclude both skip it.
 */
async function writeChunks(
  filePath: string,
  chunks: AsyncIterable<Uint8Array>,
): Promise<void> {
  const temporary = atomicWriteTempPath(filePath);
  try {
    const handle = await open(temporary, "w");
    try {
      for await (const chunk of chunks) await handle.write(chunk);
    } finally {
      await handle.close();
    }
    await rename(temporary, filePath);
  } catch (error) {
    // Best-effort cleanup: the write's own failure is the one to report.
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
