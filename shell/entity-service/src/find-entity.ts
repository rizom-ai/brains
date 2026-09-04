import type {
  BaseEntity,
  ContentVisibility,
  GetEntityRequest,
  ListEntitiesRequest,
} from "./types";
import { type Logger } from "@brains/utils/logger";
import { slugify } from "@brains/utils/string-utils";

export type ResolvedEntity =
  { ok: true; entity: BaseEntity } | { ok: false; error: string };

/**
 * The two reads this lookup performs, in their un-schema'd form.
 *
 * Asking for the whole `ICoreEntityService` meant a test double had to satisfy
 * members that are generic in their entity type, which no concrete function
 * can do — so doubles asserted their return into `T[]`. Naming what is
 * actually called keeps a double an ordinary function; a real entity service
 * still satisfies this by construction.
 */
export interface EntityLookupReads {
  getEntity(request: GetEntityRequest): Promise<BaseEntity | null>;
  listEntities(request: ListEntitiesRequest): Promise<BaseEntity[]>;
}

/**
 * Find an entity by trying ID, slug, then title lookups.
 *
 * Propagates the visibility scope to every lookup path so the slug/title
 * fallbacks cannot leak entities the caller is not allowed to see.
 * Defaults to "public" when no scope is provided.
 */
export async function findEntityByIdentifier(
  entityService: EntityLookupReads,
  entityType: string,
  identifier: string,
  logger?: Logger,
  visibilityScope: ContentVisibility = "public",
): Promise<BaseEntity | null> {
  try {
    const byId = await entityService.getEntity({
      entityType,
      id: identifier,
      visibilityScope,
    });
    if (byId) return byId;

    const bySlug = await entityService.listEntities({
      entityType,
      options: {
        limit: 1,
        filter: { metadata: { slug: identifier }, visibilityScope },
      },
    });
    if (bySlug[0]) return bySlug[0];

    const byTitle = await entityService.listEntities({
      entityType,
      options: {
        limit: 1,
        filter: { metadata: { title: identifier }, visibilityScope },
      },
    });
    if (byTitle[0]) return byTitle[0];

    const bySlugifiedTitle = await entityService.listEntities({
      entityType,
      options: {
        limit: 1,
        filter: { metadata: { title: slugify(identifier) }, visibilityScope },
      },
    });
    if (bySlugifiedTitle[0]) return bySlugifiedTitle[0];

    const entities = await entityService.listEntities({
      entityType,
      options: { limit: 200, filter: { visibilityScope } },
    });
    const normalizedIdentifier = slugify(identifier);
    return (
      entities.find(
        (entity) =>
          typeof entity.metadata["title"] === "string" &&
          slugify(entity.metadata["title"]) === normalizedIdentifier,
      ) ?? null
    );
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
  entityService: EntityLookupReads,
  entityType: string,
  identifier: string,
  logger?: Logger,
  label = "Entity",
  visibilityScope: ContentVisibility = "public",
): Promise<ResolvedEntity> {
  const entity = await findEntityByIdentifier(
    entityService,
    entityType,
    identifier,
    logger,
    visibilityScope,
  );
  if (!entity) {
    return {
      ok: false,
      error: `${label} not found: ${entityType}/${identifier}`,
    };
  }
  return { ok: true, entity };
}
