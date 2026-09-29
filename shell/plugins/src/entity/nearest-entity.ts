import type {
  BaseEntity,
  ContentVisibility,
  GetEntityRequest,
} from "@brains/entity-service";

export interface NearestEntityDeps<T extends BaseEntity> {
  searchWithDistances(request: {
    query: string;
  }): Promise<
    Array<{ entityId: string; entityType: string; distance: number }>
  >;
  getEntity(request: GetEntityRequest): Promise<T | null>;
}

export interface NearestEntityQuery {
  /** Text in the form the stored entities were embedded from (their markdown). */
  query: string;
  entityType: string;
  /** Largest cosine distance that still counts as the same entity. */
  maxDistance: number;
  /** Only an entity of exactly this visibility can match. */
  visibility: ContentVisibility;
}

/**
 * The closest stored entity of `entityType` within `maxDistance` of `query`,
 * of exactly `visibility`. Distances are raw cosine distances, not the hybrid
 * search score, so a reworded duplicate matches without sharing a phrase.
 */
export async function findNearestEntity<T extends BaseEntity>(
  deps: NearestEntityDeps<T>,
  request: NearestEntityQuery,
): Promise<T | undefined> {
  const distances = await deps.searchWithDistances({ query: request.query });
  const candidates: Array<T | null> = await Promise.all(
    distances
      .filter(
        (result) =>
          result.entityType === request.entityType &&
          result.distance <= request.maxDistance,
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
  return (
    candidates.find(
      (candidate) => candidate?.visibility === request.visibility,
    ) ?? undefined
  );
}
