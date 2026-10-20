import type { BaseEntity, NearestToEntityRequest } from "@brains/plugins";

export interface NearestMatch {
  entityId: string;
  entityType: string;
  distance: number;
}

/**
 * A stand-in for the store's nearest-entries query over fixed distances. Like
 * the store, it joins each match to its entry: a match without one is never
 * returned, and a request for metadata gets the entry's.
 */
export function nearestStore(
  matches: NearestMatch[],
  entries: BaseEntity[],
): (
  request: NearestToEntityRequest,
) => Promise<Array<NearestMatch & { metadata?: Record<string, unknown> }>> {
  const entryOf = (match: NearestMatch): BaseEntity | undefined =>
    entries.find(
      (entry) =>
        entry.id === match.entityId && entry.entityType === match.entityType,
    );
  return async (request) =>
    matches
      .filter(
        (match) =>
          request.types.includes(match.entityType) &&
          entryOf(match) !== undefined &&
          (request.maxDistance === undefined ||
            match.distance <= request.maxDistance),
      )
      .sort((a, b) => a.distance - b.distance)
      .slice(0, request.limit ?? matches.length)
      .map((match) =>
        request.includeMetadata
          ? { ...match, metadata: entryOf(match)?.metadata ?? {} }
          : match,
      );
}
