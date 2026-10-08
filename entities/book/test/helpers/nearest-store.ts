import type { NearestToEntityRequest } from "@brains/plugins";

export interface NearestMatch {
  entityId: string;
  entityType: string;
  distance: number;
}

/** A stand-in for the store's nearest-entries query over fixed distances. */
export function nearestStore(
  matches: NearestMatch[],
): (request: NearestToEntityRequest) => Promise<NearestMatch[]> {
  return async (request) =>
    matches
      .filter(
        (match) =>
          request.types.includes(match.entityType) &&
          (request.maxDistance === undefined ||
            match.distance <= request.maxDistance),
      )
      .sort((a, b) => a.distance - b.distance)
      .slice(0, request.limit ?? matches.length);
}
