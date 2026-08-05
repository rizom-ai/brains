import type { BaseEntity, ContentVisibility } from "@brains/plugins";
import { internalFullScope } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { getErrorMessage } from "@brains/utils/error";
import { computeContentHash } from "@brains/utils/hash";
import type { ImportResult, RawEntity } from "../types";

import { resolveInSyncPath } from "./path-utils";

export interface ImportPersistenceDeps {
  entityService: {
    getEntity(request: {
      entityType: string;
      id: string;
      visibilityScope?: ContentVisibility;
    }): Promise<BaseEntity | null>;
    serializeEntity(entity: BaseEntity): string;
    upsertEntity(request: { entity: BaseEntity }): Promise<{ jobId: string }>;
  };
  logger: Logger;
  fileOperations: {
    shouldUpdateEntity(existing: BaseEntity, rawEntity: RawEntity): boolean;
  };
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
): Promise<void> {
  try {
    const existing = await deps.entityService.getEntity({
      entityType: rawEntity.entityType,
      id: rawEntity.id,
      visibilityScope: internalFullScope(
        "directory sync indexes entities across all visibility tiers",
      ),
    });

    if (
      existing &&
      !deps.fileOperations.shouldUpdateEntity(existing, rawEntity)
    ) {
      result.skipped++;
      return;
    }

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
    const entity: BaseEntity = {
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
    // Store canonical hash so auto-sync writes don't trigger a re-import:
    // after auto-sync writes serializeEntity(entity) to disk, the file hash
    // matches this hash and shouldUpdateEntity returns false.
    entity.contentHash = computeContentHash(
      deps.entityService.serializeEntity(entity),
    );

    const upsertResult = await deps.entityService.upsertEntity({
      entity: entity,
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
