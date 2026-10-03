import type {
  BaseEntity,
  ContentVisibility,
  EntityServiceClient,
  StagedAsset,
} from "@brains/plugins";
import { base64AssetSource, EntityWriteConflictError } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { getErrorMessage } from "@brains/utils/error";
import { computeContentHash } from "@brains/utils/hash";
import type { ImportResult, RawEntity } from "../types";

import { resolveInSyncPath } from "./path-utils";
import { recordImportIssue, recordSkippedImport } from "./import-result";

export interface ImportPersistenceDeps {
  entityService: Pick<
    EntityServiceClient,
    "serializeEntity" | "upsertEntity" | "getEntityTypeConfig" | "stageAsset"
  >;
  maxAssetImportBytes: number;
  logger: Logger;
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

export async function persistImportEntity(
  deps: ImportPersistenceDeps,
  rawEntity: RawEntity,
  parsedEntity: Partial<BaseEntity>,
  filePath: string,
  result: ImportResult,
  snapshot: Awaited<ReturnType<EntityServiceClient["getEntityWriteSnapshot"]>>,
  /** Bytes already staged from the file; otherwise inline content is staged here. */
  staged?: StagedAsset,
): Promise<void> {
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
    // database wins. Auto-sync will rewrite the file with the retained value,
    // so surface the override rather than letting an edit vanish silently.
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
      content: parsedEntity.content ?? rawEntity.content,
      visibility,
      metadata: { ...adapterMetadata, ...sidecarMetadata },
      created: existing?.created ?? rawEntity.created.toISOString(),
      updated: rawEntity.updated.toISOString(),
      contentHash: "",
    };
    const { entity, stagedAsset } = staged
      ? { entity: inline, stagedAsset: staged }
      : await stageAssetContent(deps, inline);
    // Store canonical hash so auto-sync writes don't trigger a re-import:
    // after auto-sync writes serializeEntity(entity) to disk, the file hash
    // matches this hash and shouldUpdateEntity returns false.
    entity.contentHash = computeContentHash(
      deps.entityService.serializeEntity(entity),
    );

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
      existing?.contentHash === entity.contentHash &&
      existing.visibility === entity.visibility &&
      Bun.deepEquals(existing.metadata, entity.metadata)
    ) {
      recordSkippedImport(result);
      return;
    }
    const options = {
      persistenceOrigin: "directory-sync" as const,
      conditionalWrite: { expectedRevision: snapshot?.revision ?? null },
    };
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
  }
}

const DATA_URL_PREFIX = /^data:([^;,]+);base64,/;

/**
 * Asset-backed types store the file's bytes as a staged asset and keep only
 * the reference, with the facts a reader needs without loading bytes.
 */
async function stageAssetContent(
  deps: ImportPersistenceDeps,
  entity: BaseEntity,
): Promise<{ entity: BaseEntity; stagedAsset?: StagedAsset }> {
  if (
    deps.entityService.getEntityTypeConfig(entity.entityType).binaryStorage !==
    "asset"
  ) {
    return { entity };
  }
  const prefix = DATA_URL_PREFIX.exec(entity.content);
  if (!prefix?.[1]) return { entity };
  // Text-form image files may wrap or end their payload with whitespace,
  // which inline storage decoded leniently.
  const base64 = entity.content.slice(prefix[0].length).replace(/\s/g, "");
  const stagedAsset = await deps.entityService.stageAsset(
    base64AssetSource(base64),
    { maxBytes: deps.maxAssetImportBytes },
  );
  return {
    stagedAsset,
    entity: {
      ...entity,
      content: stagedAsset.ref,
      metadata: {
        ...entity.metadata,
        mediaType: prefix[1],
        sizeBytes: stagedAsset.sizeBytes,
      },
    },
  };
}
