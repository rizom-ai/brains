import type {
  BaseEntity,
  ContentVisibility,
  GetEntityRequest,
  SearchWithDistancesRequest,
} from "@brains/entity-service";

export interface NearestEntityDeps<T extends BaseEntity> {
  searchWithDistances(
    request: SearchWithDistancesRequest,
  ): Promise<Array<{ entityId: string; entityType: string; distance: number }>>;
  getEntity(request: GetEntityRequest): Promise<T | null>;
}

export interface NearestEntityQuery<T extends BaseEntity = BaseEntity> {
  /** Text in the form the stored entities were embedded from (their markdown). */
  query: string;
  entityType: string;
  /** Largest cosine distance that still counts as the same entity. */
  maxDistance: number;
  /** Only an entity of exactly this visibility can match. */
  visibility: ContentVisibility;
  /** Entities never to return, such as the one being compared. */
  excludeIds?: string[];
  /**
   * Second opinion on a candidate within the distance, closest first. Embedding
   * distance barely registers opposite meaning ("publish" vs "unpublish"), so
   * callers that merge on a match confirm it; the first accepted one wins.
   */
  confirm?: (candidate: T) => Promise<boolean>;
}

/**
 * The closest stored entity of `entityType` within `maxDistance` of `query`,
 * of exactly `visibility`. Distances are raw cosine distances, not the hybrid
 * search score, so a reworded duplicate matches without sharing a phrase.
 */
export async function findNearestEntity<T extends BaseEntity>(
  deps: NearestEntityDeps<T>,
  request: NearestEntityQuery<T>,
): Promise<T | undefined> {
  const distances = await deps.searchWithDistances({
    query: request.query,
    types: [request.entityType],
    maxDistance: request.maxDistance,
  });
  // The index narrows by type and distance; checked again so any deps holds.
  const candidates: Array<T | null> = await Promise.all(
    distances
      .filter(
        (result) =>
          result.entityType === request.entityType &&
          result.distance <= request.maxDistance &&
          !request.excludeIds?.includes(result.entityId),
      )
      .map((result) =>
        deps.getEntity({
          entityType: request.entityType,
          id: result.entityId,
          visibilityScope: request.visibility,
        }),
      ),
  );
  // The scope also admits less visible entities; a match needs an exact one.
  const sameVisibility = candidates.filter(
    (candidate): candidate is NonNullable<typeof candidate> =>
      candidate?.visibility === request.visibility,
  );
  const confirm = request.confirm;
  if (!confirm) return sameVisibility[0];

  const firstConfirmed = async (index: number): Promise<T | undefined> => {
    const candidate = sameVisibility[index];
    if (!candidate) return undefined;
    return (await confirm(candidate)) ? candidate : firstConfirmed(index + 1);
  };
  return firstConfirmed(0);
}
