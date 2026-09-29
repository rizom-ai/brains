import {
  canonicalContentVisibilitySchema,
  MAX_SEARCH_QUERY_CHARS,
  type BaseEntity,
  type ContentVisibility,
  type DataSourceGenerationContext,
  type IEntityService,
  type SearchResult,
} from "@brains/entity-service";

import { GenerationLimitError } from "./generation-limits";

export interface GenerationReadOptions {
  /** Capped to output visibility after caller authorization, never caller input. */
  visibilityScope: ContentVisibility;
}

/**
 * Read-only, visibility-fixed access for a durable generation job.
 *
 * Authority is resolved twice per job: once when the worker starts it, and
 * again at the entity write boundary, where revocation must block persistence.
 * Reads therefore carry the scope decided at admission and check cancellation
 * only. The entity service owns the visibility predicate; nothing is re-filtered.
 */
export function createGenerationReadContext(
  entities: Pick<IEntityService, "getEntity" | "search">,
  options: GenerationReadOptions,
  signal?: AbortSignal,
): DataSourceGenerationContext {
  const visibilityScope = canonicalContentVisibilitySchema.parse(
    options.visibilityScope,
  );
  return {
    visibilityScope,
    ...(signal && { signal }),
    async getEntity(entityType, id): Promise<BaseEntity | null> {
      signal?.throwIfAborted();
      const entity = await entities.getEntity({
        entityType,
        id,
        visibilityScope,
        ...(signal && { signal }),
      });
      signal?.throwIfAborted();
      return entity;
    },
    async search(query, searchOptions): Promise<SearchResult[]> {
      signal?.throwIfAborted();
      if (query.length > MAX_SEARCH_QUERY_CHARS) {
        throw new GenerationLimitError(
          `Content generation search query exceeds ${MAX_SEARCH_QUERY_CHARS} characters`,
        );
      }
      const results = await entities.search({
        query,
        options: {
          ...searchOptions,
          visibilityScope,
          ...(signal && { signal }),
        },
      });
      signal?.throwIfAborted();
      return results;
    },
  };
}
