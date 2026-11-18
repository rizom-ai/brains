import { compareWithBase, type SyncConflicts } from "./sync-base";
import {
  base64AssetSource,
  type ServiceEntityMirrorClient,
  type ContentVisibility,
  type StagedAsset,
} from "@brains/sdk/internal/service-runtime";
import {
  type BaseEntity,
  EntityWriteConflictError,
} from "@brains/sdk/internal/entity-runtime";
import type { Logger } from "@brains/utils/logger";
import { getErrorMessage } from "@brains/utils/error";
import { computeContentHash } from "@brains/utils/hash";
import { readMarkdownFrontmatter } from "@brains/utils/markdown-frontmatter";
import { createHash } from "node:crypto";
import {
  base64ImageReader,
  describeImage,
  isLegacyPendingImageBytes,
} from "@brains/image";
import type { ImportResult, RawEntity } from "../types";

import { resolveInSyncPath } from "./path-utils";
import {
  recordedStatus,
  recordImportIssue,
  recordLegacyPlaceholderSkip,
  recordSkippedImport,
} from "./import-result";
import { isRecord } from "@brains/utils/is-record";

export interface ImportPersistenceDeps {
  entityService: Pick<
    ServiceEntityMirrorClient,
    | "serializeEntity"
    | "upsertEntity"
    | "getEntityTypeConfig"
    | "stageAsset"
    | "discardStagedAsset"
  >;
  maxAssetImportBytes: number;
  logger: Logger;
  /** Bases and conflicts; without them a differing file always wins. */
  conflicts?: SyncConflicts | undefined;
  /** Write an entity's file as export does, where a file must not win. */
  restoreEntityFile?: ((entity: BaseEntity) => Promise<void>) | undefined;
  quarantine: {
    isValidationError(error: unknown): boolean;
    quarantineInvalidFile(
      filePath: string,
      error: unknown,
      result: ImportResult,
      resolveFilePath: (filePath: string) => string,
    ): Promise<void>;
    markAsRecoveredIfNeeded(filePath: string): Promise<void>;
  };
  imageJobQueue: { syncPath: string };
}

interface ResolvedVisibility {
  visibility: ContentVisibility;
  /**
   * Set when the file declared nothing and a non-public stored tier was kept,
   * i.e. the file on disk understates the entity's visibility.
   */
  retainedFrom?: ContentVisibility;
}

/**
 * A file that declares no visibility carries no opinion about it, so an
 * existing entity keeps its stored tier. Only an explicit frontmatter value
 * moves an entity between tiers; without this, any file exported as public
 * (which omits the key) would silently publish a restricted entity on the
 * next import.
 */
function resolveImportVisibility(
  parsedEntity: Partial<BaseEntity>,
  existing: BaseEntity | null,
): ResolvedVisibility {
  if (parsedEntity.visibility) {
    return { visibility: parsedEntity.visibility };
  }

  const stored = existing?.visibility;
  if (stored && stored !== "public") {
    return { visibility: stored, retainedFrom: stored };
  }

  return { visibility: stored ?? "public" };
}

function frontmatterRecord(markdown: string): Record<string, unknown> {
  const { data } = readMarkdownFrontmatter(markdown);
  return isRecord(data) ? data : {};
}

/**
 * Whether the stored form drops a frontmatter field the file holds, at the
 * top level or one level inside an object. Visibility is policy: a public
 * file may declare it, while its stored form omits it.
 */
function dropsFrontmatterFields(file: string, stored: string): boolean {
  const kept = frontmatterRecord(stored);
  return Object.entries(frontmatterRecord(file)).some(([key, value]) => {
    if (key === "visibility") return false;
    if (!Object.hasOwn(kept, key)) return true;
    const keptValue = kept[key];
    return (
      isRecord(value) &&
      isRecord(keptValue) &&
      Object.keys(value).some((nested) => !Object.hasOwn(keptValue, nested))
    );
  });
}

/** An image file as a conflict would keep it. */
export interface LosingImage {
  read(): Promise<Uint8Array>;
  /** What the bytes are: format and dimensions. */
  metadata: Record<string, unknown>;
}

export async function persistImportEntity(
  deps: ImportPersistenceDeps,
  rawEntity: RawEntity,
  parsedEntity: Partial<BaseEntity>,
  filePath: string,
  result: ImportResult,
  snapshot: Awaited<
    ReturnType<ServiceEntityMirrorClient["getEntityWriteSnapshot"]>
  >,
  /** Bytes already staged from the file; otherwise inline content is staged here. */
  staged?: StagedAsset,
  /** The file as an image, when it is one: what a conflict would keep. */
  losingImage?: LosingImage,
): Promise<void> {
  // Staged bytes no upsert takes are discarded on every other way out.
  let unpublished = staged;
  try {
    const existing = snapshot?.entity ?? null;

    // Spread parsedEntity first so type-specific fields (e.g., title, status
    // for decks) are preserved, then override with canonical BaseEntity fields.
    // rawEntity.metadata wins last because it carries fields the adapter
    // cannot recover from content alone (e.g., document sidecar metadata).
    const sidecarMetadata = rawEntity.metadata ?? {};
    const adapterMetadata = parsedEntity.metadata ?? {};
    const { visibility, retainedFrom } = resolveImportVisibility(
      parsedEntity,
      existing,
    );
    // The file and the database disagree about a non-public tier, and the
    // database wins. The import is an ordinary write, so auto-sync rewrites
    // the file with the retained value; surface the override too, rather
    // than letting an edit vanish silently.
    if (retainedFrom) {
      deps.logger.debug(
        "Retained stored visibility; imported file declared none",
        {
          path: filePath,
          entityType: rawEntity.entityType,
          id: rawEntity.id,
          retained: retainedFrom,
        },
      );
    }
    const inline: BaseEntity = {
      ...parsedEntity,
      id: parsedEntity.id ?? rawEntity.id,
      entityType: parsedEntity.entityType ?? rawEntity.entityType,
      // The file itself, as createEntityFromMarkdown imports one: a declared
      // type decodes it into its body, and the store keeps the frontmatter
      // the type does not write only from the whole document.
      content: rawEntity.content,
      visibility,
      metadata: { ...adapterMetadata, ...sidecarMetadata },
      created: existing?.created ?? rawEntity.created.toISOString(),
      updated: rawEntity.updated.toISOString(),
      contentHash: "",
    };
    const staging = staged
      ? { entity: inline, stagedAsset: staged }
      : await stageAssetContent(deps, inline, existing);
    if ("placeholder" in staging) {
      recordLegacyPlaceholderSkip(result, filePath);
      return;
    }
    const { entity, stagedAsset } = staging;
    unpublished = stagedAsset;
    // Store canonical hash so auto-sync writes don't trigger a re-import:
    // after auto-sync writes serializeEntity(entity) to disk, the file hash
    // matches this hash and shouldUpdateEntity returns false.
    const stored = deps.entityService.serializeEntity(entity);
    entity.contentHash = computeContentHash(stored);
    // The brain keeps none of a field its stored form drops, such as one the
    // type has retired. Such a file is written back in its stored form, so it
    // stops showing what the brain no longer holds.
    // A retained tier is written back too, so the file stops understating it.
    const writeBack =
      retainedFrom !== undefined ||
      dropsFrontmatterFields(rawEntity.content, stored);

    if (
      entity.entityType !== rawEntity.entityType ||
      entity.id !== rawEntity.id
    )
      throw new Error(
        "Directory import adapter changed the admitted destination",
      );

    // A file that is not in canonical form (a missing final newline, say)
    // hashes differently from the stored row on every sync, yet parses to
    // exactly what is stored. Writing it again would only move `updated`
    // and queue derived work, so leave it.
    if (
      !writeBack &&
      existing?.contentHash === entity.contentHash &&
      existing.visibility === entity.visibility &&
      Bun.deepEquals(existing.metadata, entity.metadata)
    ) {
      // The two agree: that is their base, whatever was recorded before.
      await deps.conflicts?.base.set(
        entity.entityType,
        entity.id,
        existing.contentHash,
        staged || stagedAsset
          ? undefined
          : computeContentHash(rawEntity.content),
      );
      recordSkippedImport(result);
      return;
    }
    // A file that differs from its entity is an edit only against the
    // version the two last agreed on. Text and images are settled that
    // way; any other binary file keeps winning, having nothing a conflict
    // could hold.
    if (
      existing &&
      deps.conflicts &&
      (losingImage !== undefined || (!staged && !stagedAsset))
    ) {
      const settled = await settleAgainstBase(
        deps,
        deps.conflicts,
        { rawEntity, entity, existing, filePath, losingImage },
        result,
      );
      if (settled) return;
    }
    const options = {
      persistenceOrigin: writeBack
        ? ("ordinary" as const)
        : ("directory-sync" as const),
      conditionalWrite: { expectedRevision: snapshot?.revision ?? null },
    };
    // The upsert publishes the staged bytes or discards them itself.
    unpublished = undefined;
    const upsertResult = await deps.entityService.upsertEntity({
      entity,
      ...(stagedAsset && { stagedAsset }),
      options,
    });
    result.imported++;
    result.jobIds.push(upsertResult.jobId);
    deps.logger.debug("Imported entity from directory", {
      path: filePath,
      entityType: rawEntity.entityType,
      id: rawEntity.id,
      jobId: upsertResult.jobId,
    });

    // A file written back differs from the one read; export records it.
    await deps.conflicts?.base.set(
      entity.entityType,
      entity.id,
      entity.contentHash,
      writeBack || staged || stagedAsset
        ? undefined
        : computeContentHash(rawEntity.content),
    );
    await deps.quarantine.markAsRecoveredIfNeeded(filePath);
  } catch (error) {
    if (error instanceof EntityWriteConflictError) {
      result.skipped++;
      recordImportIssue(
        result,
        filePath,
        "Skipped stale import: entity changed while reading the file.",
      );
      return;
    }
    if (deps.quarantine.isValidationError(error)) {
      await deps.quarantine.quarantineInvalidFile(
        filePath,
        error,
        result,
        (fp) => resolveInSyncPath(deps.imageJobQueue.syncPath, fp),
      );
      return;
    }

    result.failed++;
    result.errors.push({
      path: filePath,
      error:
        error instanceof Error
          ? `Transient error (file not quarantined): ${error.message}`
          : String(error),
    });
    deps.logger.warn(
      "Failed to import entity (transient error, not quarantined)",
      {
        path: filePath,
        entityType: rawEntity.entityType,
        id: rawEntity.id,
        error: getErrorMessage(error),
      },
    );
  } finally {
    if (unpublished) {
      // Best effort: the startup sweep reclaims an upload this misses.
      await deps.entityService
        .discardStagedAsset(unpublished)
        .catch(() => undefined);
    }
  }
}

/**
 * Decide a differing file against the version it last agreed with its
 * entity on. True when the file must not be imported: it is stale, or both
 * changed and its text is now a conflict. Either way the entity stands, and
 * its file is written back so the two agree again.
 */
async function settleAgainstBase(
  deps: ImportPersistenceDeps,
  conflicts: SyncConflicts,
  edit: {
    rawEntity: RawEntity;
    entity: BaseEntity;
    existing: BaseEntity;
    filePath: string;
    losingImage?: LosingImage | undefined;
  },
  result: ImportResult,
): Promise<boolean> {
  const { rawEntity, entity, existing, filePath, losingImage } = edit;
  const base = await conflicts.base.get(existing.entityType, existing.id);
  const verdict = compareWithBase({
    base,
    fileHash: entity.contentHash,
    entityHash: existing.contentHash,
  });
  if (verdict === "import") return false;

  if (verdict === "conflict") {
    const held = await conflicts.record({
      entityType: existing.entityType,
      entityId: existing.id,
      origin: "file",
      ...(base ? { base } : {}),
      current: existing.contentHash,
      ...(losingImage
        ? {
            text: "",
            image: {
              bytes: await losingImage.read(),
              metadata: losingImage.metadata,
            },
          }
        : { text: rawEntity.content }),
      targetVisibility: existing.visibility,
      ...(entity.visibility !== existing.visibility
        ? { declaredVisibility: entity.visibility }
        : {}),
    });
    if (!held) {
      // The file is the edit's only copy: it stays as it is.
      recordSkippedImport(result);
      recordImportIssue(
        result,
        filePath,
        "Not imported: the entry changed in the brain too, and this file's edit could not be kept as a conflict. The file is left as it is.",
      );
      return true;
    }
  }
  await deps.restoreEntityFile?.(existing);
  await conflicts.base.set(
    existing.entityType,
    existing.id,
    existing.contentHash,
  );
  recordSkippedImport(result);
  // A stale file is the ordinary case of an export that had not run yet,
  // and nothing to report; a conflict is.
  if (verdict === "conflict") {
    recordImportIssue(
      result,
      filePath,
      "Not imported: the entry changed in the brain too. This file's edit is kept as a conflict in the Inbox, and the file now holds the brain's version.",
    );
  }
  return true;
}

const DATA_URL_PAYLOAD = /^data:[^;,]+;base64,([\s\S]*)$/;

/**
 * Asset-backed types store the file's bytes as a staged asset and keep only
 * the reference, with the facts a reader needs without loading bytes. A
 * markdown image file holds its data URL as text: it is decoded and staged
 * the same way. Content that is not a supported raster image stays as it
 * was stored before assets. The old placeholder of an image awaiting its
 * bytes is never staged.
 */
async function stageAssetContent(
  deps: ImportPersistenceDeps,
  entity: BaseEntity,
  existing: BaseEntity | null,
): Promise<
  { entity: BaseEntity; stagedAsset?: StagedAsset } | { placeholder: true }
> {
  if (
    deps.entityService.getEntityTypeConfig(entity.entityType).binaryStorage !==
    "asset"
  ) {
    return { entity };
  }
  // Text-form image files may wrap or end their payload with whitespace,
  // and a non-public one may declare its tier above it.
  const body = readMarkdownFrontmatter(entity.content).content.trim();
  const payload = DATA_URL_PAYLOAD.exec(body)?.[1]?.replace(/\s/g, "");
  if (!payload) return { entity };
  const described = await describeImage(base64ImageReader(payload));
  if (!described) return { entity };
  const status =
    recordedStatus(existing?.metadata) ?? recordedStatus(entity.metadata);
  if (
    status !== undefined &&
    isLegacyPendingImageBytes(payloadDigest(payload), status)
  ) {
    return { placeholder: true };
  }
  const stagedAsset = await deps.entityService.stageAsset(
    base64AssetSource(payload),
    { maxBytes: deps.maxAssetImportBytes },
  );
  return {
    stagedAsset,
    entity: {
      ...entity,
      content: stagedAsset.ref,
      metadata: {
        ...entity.metadata,
        ...described,
        sizeBytes: stagedAsset.sizeBytes,
      },
    },
  };
}

/** The SHA-256 of a base64 payload's bytes, decoded a slice at a time. */
function payloadDigest(payload: string): string {
  const hash = createHash("sha256");
  for (const slice of base64AssetSource(payload)) hash.update(slice);
  return hash.digest("hex");
}
