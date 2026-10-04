import {
  getVisibleContentVisibilities,
  type BaseEntity,
  type EntitySearchRequest,
  type SearchResult,
  type SearchWithDistancesRequest,
} from "@brains/entity-service";

/** Mirrors the SQL publication gate, including adapter-specific lifecycles. */
export function isFixtureEntityPublished(
  entity: BaseEntity,
  publishedStatuses?: readonly string[],
): boolean {
  const status = entity.metadata["status"];
  if (publishedStatuses?.length) {
    return typeof status === "string" && publishedStatuses.includes(status);
  }
  return (
    status === undefined ||
    status === null ||
    status === "published" ||
    status === "active"
  );
}

/**
 * Deterministic fixture search, not a simulation of FTS or vector ranking.
 * Every whitespace-separated term must occur in the id, title, or body.
 * Matching records score 1 (before explicit type weights); ties use type/id.
 */
export function searchFixtureEntities(
  entities: readonly BaseEntity[],
  { query, options = {} }: EntitySearchRequest,
  publishedStatusesFor: (type: string) => readonly string[] | undefined = () =>
    undefined,
): SearchResult[] {
  options.signal?.throwIfAborted();
  const terms = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  if (!terms.length) return [];
  const visible = getVisibleContentVisibilities(
    options.visibilityScope ?? "public",
  );
  const results = entities.flatMap((entity): SearchResult[] => {
    if (!visible.includes(entity.visibility)) return [];
    if (options.types?.length && !options.types.includes(entity.entityType))
      return [];
    if (options.excludeTypes?.includes(entity.entityType)) return [];
    if (
      options.publishedOnly &&
      !isFixtureEntityPublished(entity, publishedStatusesFor(entity.entityType))
    )
      return [];
    if (
      !options.includeUngenerated &&
      ["generating", "failed"].includes(String(entity.metadata["status"]))
    )
      return [];
    const title =
      typeof entity.metadata["title"] === "string"
        ? entity.metadata["title"]
        : "";
    const text = `${entity.id}\n${title}\n${entity.content}`.toLowerCase();
    if (!terms.every((term) => text.includes(term))) return [];
    const weight = options.weight?.[entity.entityType] ?? 1;
    const score = Number.isFinite(weight) ? weight : 1;
    if (options.minScore !== undefined && score < options.minScore) return [];
    return [{ entity, score, excerpt: entity.content.slice(0, 200) }];
  });
  const compare = (left: string, right: string): number =>
    left < right ? -1 : left > right ? 1 : 0;
  results.sort((left, right) => {
    const field = options.sortBy ?? "relevance";
    const value =
      field === "relevance"
        ? left.score - right.score
        : compare(left.entity[field], right.entity[field]);
    const ordered = options.sortDirection === "asc" ? value : -value;
    return (
      ordered ||
      compare(left.entity.entityType, right.entity.entityType) ||
      compare(left.entity.id, right.entity.id)
    );
  });
  const offset = options.offset ?? 0;
  return results.slice(offset, offset + (options.limit ?? 20));
}

export interface FixtureDistance {
  readonly entityType: string;
  readonly entityId: string;
  readonly distance: number;
}

/** Explicit distances, never inferred from lexical fixture scores. */
export function searchFixtureDistances(
  entities: readonly BaseEntity[],
  distances: readonly FixtureDistance[],
  request: SearchWithDistancesRequest,
  publishedStatusesFor: (type: string) => readonly string[] | undefined = () =>
    undefined,
): Array<{ entityType: string; entityId: string; distance: number }> {
  request.signal?.throwIfAborted();
  const visible =
    request.visibilityScope &&
    getVisibleContentVisibilities(request.visibilityScope);
  const results = distances
    .filter((row) => {
      const entity = entities.find(
        (entry) =>
          entry.entityType === row.entityType && entry.id === row.entityId,
      );
      return (
        entity !== undefined &&
        (!request.types?.length || request.types.includes(row.entityType)) &&
        (request.maxDistance === undefined ||
          row.distance <= request.maxDistance) &&
        (!request.visibility || entity.visibility === request.visibility) &&
        (!visible || visible.includes(entity.visibility)) &&
        (!request.publishedOnly ||
          isFixtureEntityPublished(
            entity,
            publishedStatusesFor(entity.entityType),
          )) &&
        !request.excludeIds?.includes(row.entityId)
      );
    })
    .map((row) => ({ ...row }));
  const compare = (a: string, b: string): number =>
    a < b ? -1 : a > b ? 1 : 0;
  results.sort(
    (a, b) =>
      a.distance - b.distance ||
      compare(a.entityType, b.entityType) ||
      compare(a.entityId, b.entityId),
  );
  return request.limit === undefined
    ? results
    : results.slice(0, request.limit);
}
