import type { BaseEntity, ICoreEntityService } from "./types";
import type { Logger } from "@brains/utils";

/**
 * Result of attempting to resolve an entity by identifier.
 * Discriminated union so callers can narrow without re-checking null.
 */
export type ResolvedEntity = { entity: BaseEntity } | { error: string };

/**
 * Find an entity by trying ID, slug, then title lookups.
 *
 * Shared utility used by SystemPlugin and ImagePlugin to resolve
 * an entity from an ambiguous identifier string.
 */
export async function findEntityByIdentifier(
  entityService: ICoreEntityService,
  entityType: string,
  identifier: string,
  logger?: Logger,
): Promise<BaseEntity | null> {
  try {
    // Try direct ID lookup first
    const byId = await entityService.getEntity(entityType, identifier);
    if (byId) return byId;

    // Try by slug
    const bySlug = await entityService.listEntities(entityType, {
      limit: 1,
      filter: { metadata: { slug: identifier } },
    });
    if (bySlug[0]) return bySlug[0];

    // Try by title
    const byTitle = await entityService.listEntities(entityType, {
      limit: 1,
      filter: { metadata: { title: identifier } },
    });
    if (byTitle[0]) return byTitle[0];

    return null;
  } catch (error) {
    if (logger) {
      logger.error(`Failed to find entity ${entityType}:${identifier}`, {
        error,
      });
    }
    return null;
  }
}

/**
 * Resolve an entity by identifier or return a formatted error message.
 * Wraps findEntityByIdentifier with the common null-check + error-string pattern.
 *
 * @param label - Prefix for the error message, e.g. "Entity" (default) or "Target entity"
 */
export async function resolveEntityOrError(
  entityService: ICoreEntityService,
  entityType: string,
  identifier: string,
  logger?: Logger,
  label = "Entity",
): Promise<ResolvedEntity> {
  const entity = await findEntityByIdentifier(
    entityService,
    entityType,
    identifier,
    logger,
  );
  if (!entity) {
    return { error: `${label} not found: ${entityType}/${identifier}` };
  }
  return { entity };
}
