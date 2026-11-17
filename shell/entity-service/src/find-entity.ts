import type {
  BaseEntity,
  ContentVisibility,
  GetEntityRawRequest,
  EntityReadOptions,
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
  /**
   * Stored content, never resolved: callers set a field and write the entity
   * back, and a resolved read would persist inlined image bytes.
   */
  getEntityRaw(request: GetEntityRawRequest): Promise<BaseEntity | null>;
  listEntities(request: ListEntitiesRequest): Promise<BaseEntity[]>;
}

/** How an identifier lookup reads: cancellation, and whether only published work counts. */
export interface EntityLookupOptions extends EntityReadOptions {
  publishedOnly?: boolean;
  /** Read the stored document, as `source` reads do. */
  source?: boolean;
}

/** The entity a lookup names: its type, and an id, slug or title. */
export interface EntityIdentifierRef {
  entityType: string;
  identifier: string;
}

/** Who is looking: the scope is required, so no caller reads public-only by omission. */
export interface EntityLookupScope {
  visibilityScope: ContentVisibility;
  logger?: Logger;
  read?: EntityLookupOptions;
}

/** A lookup that reports a miss as an error message, prefixed by `label`. */
export interface ResolveEntityOptions extends EntityLookupScope {
  /** Prefix for the error message, e.g. "Entity" (default) or "Target entity". */
  label?: string;
}

/**
 * Find an entity by trying ID, slug, title, then the name as an id.
 *
 * Propagates the visibility scope to every lookup path so the slug/title
 * fallbacks cannot leak entities the caller is not allowed to see.
 * `publishedOnly` holds on every path too, so a draft is not reachable by its
 * slug or title either.
 */
export async function findEntityByIdentifier(
  entityService: EntityLookupReads,
  { entityType, identifier }: EntityIdentifierRef,
  { visibilityScope, logger, read = {} }: EntityLookupScope,
): Promise<BaseEntity | null> {
  const readOptions: EntityLookupOptions = {
    ...(read.signal && { signal: read.signal }),
    ...(read.publishedOnly && { publishedOnly: true }),
    ...(read.binaryContent && { binaryContent: read.binaryContent }),
    ...(read.source && { source: true }),
  };
  try {
    readOptions.signal?.throwIfAborted();
    const byId = await entityService.getEntityRaw({
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

    // The name an entry was saved under, when it survives only as its id: a
    // plain note states no title, so its id is where the name was kept.
    const nameAsId = slugify(identifier);
    if (nameAsId !== "" && nameAsId !== identifier) {
      const byNameAsId = await entityService.getEntityRaw({
        entityType,
        id: nameAsId,
        visibilityScope,
        ...readOptions,
      });
      readOptions.signal?.throwIfAborted();
      if (byNameAsId) return byNameAsId;
    }

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
    if (logger) {
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
 */
export async function resolveEntityOrError(
  entityService: EntityLookupReads,
  ref: EntityIdentifierRef,
  { label = "Entity", ...scope }: ResolveEntityOptions,
): Promise<ResolvedEntity> {
  const entity = await findEntityByIdentifier(entityService, ref, scope);
  if (!entity) {
    return {
      ok: false,
      error: `${label} not found: ${ref.entityType}/${ref.identifier}`,
    };
  }
  return { ok: true, entity };
}
