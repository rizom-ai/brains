import type {
  BaseEntity,
  ContentVisibility,
  GetEntityRequest,
  EntityReadOptions,
  ListEntitiesRequest,
} from "./types";
import { type Logger } from "@brains/utils/logger";
import { slugify } from "@brains/utils/string-utils";
import { entityReadBudgetSchema } from "@brains/contracts";

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
  options: EntityReadOptions = {},
): Promise<BaseEntity | null> {
  const readOptions: EntityReadOptions = {
    ...(options.readBudget !== undefined && {
      readBudget: entityReadBudgetSchema.parse(options.readBudget),
    }),
    ...(options.signal && { signal: options.signal }),
  };
  try {
    readOptions.signal?.throwIfAborted();
    if (
      readOptions.readBudget &&
      (identifier.length > readOptions.readBudget.queryCharacters ||
        entityType.length > readOptions.readBudget.queryCharacters)
    )
      throw new Error("Entity lookup input limit exceeded");
    const byId = await entityService.getEntity({
      entityType,
      id: identifier,
      visibilityScope,
      ...readOptions,
    });
    readOptions.signal?.throwIfAborted();
    if (byId) return byId;

    const bySlug = await entityService.listEntities({
      entityType,
      options: {
        limit: 1,
        filter: { metadata: { slug: identifier }, visibilityScope },
        ...readOptions,
      },
    });
    readOptions.signal?.throwIfAborted();
    if (bySlug[0]) return bySlug[0];

    const byTitle = await entityService.listEntities({
      entityType,
      options: {
        limit: 1,
        filter: { metadata: { title: identifier }, visibilityScope },
        ...readOptions,
      },
    });
    readOptions.signal?.throwIfAborted();
    if (byTitle[0]) return byTitle[0];

    const bySlugifiedTitle = await entityService.listEntities({
      entityType,
      options: {
        limit: 1,
        filter: { metadata: { title: slugify(identifier) }, visibilityScope },
        ...readOptions,
      },
    });
    readOptions.signal?.throwIfAborted();
    if (bySlugifiedTitle[0]) return bySlugifiedTitle[0];

    // Bounded reads use exact identifiers only, not a 200-row fuzzy scan.
    if (readOptions.readBudget) return null;
    const entities = await entityService.listEntities({
      entityType,
      options: { limit: 200, filter: { visibilityScope }, ...readOptions },
    });
    readOptions.signal?.throwIfAborted();
    const normalizedIdentifier = slugify(identifier);
    return (
      entities.find(
        (entity) =>
          typeof entity.metadata["title"] === "string" &&
          slugify(entity.metadata["title"]) === normalizedIdentifier,
      ) ?? null
    );
  } catch (error) {
    if (logger && !readOptions.readBudget) {
      logger.error(`Failed to find entity ${entityType}:${identifier}`, {
        error,
      });
    }
    // A store that could not answer has not told us the entity is absent.
    // Returning null here reaches the caller as "not found" — resolveEntityOrError
    // renders it as exactly that message — which sends someone looking for a
    // missing entity instead of a broken store.
    throw error;
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
  readOptions: EntityReadOptions = {},
): Promise<ResolvedEntity> {
  const entity = await findEntityByIdentifier(
    entityService,
    entityType,
    identifier,
    logger,
    visibilityScope,
    readOptions,
  );
  if (!entity) {
    return {
      ok: false,
      error: `${label} not found: ${entityType}/${identifier}`,
    };
  }
  return { ok: true, entity };
}
