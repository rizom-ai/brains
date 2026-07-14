import type { UseQueryOptions } from "@tanstack/react-query";
import {
  fetchEntities,
  fetchEntity,
  type EntityDetail,
  type EntitySummary,
} from "./api";

export type EntityListQueryKey = readonly ["cms", "entities", string];
export type EntityDetailQueryKey = readonly ["cms", "entity", string, string];

export const cmsKeys = {
  all: ["cms"] as const,
  entities: (entityType: string): EntityListQueryKey => [
    "cms",
    "entities",
    entityType,
  ],
  entity: (entityType: string, entityId: string): EntityDetailQueryKey => [
    "cms",
    "entity",
    entityType,
    entityId,
  ],
};

export function entityListQueryOptions(
  entityType: string,
): UseQueryOptions<
  EntitySummary[],
  Error,
  EntitySummary[],
  EntityListQueryKey
> {
  return {
    queryKey: cmsKeys.entities(entityType),
    queryFn: () => fetchEntities(entityType),
  };
}

export function entityDetailQueryOptions(
  entityType: string,
  entityId: string,
): UseQueryOptions<EntityDetail, Error, EntityDetail, EntityDetailQueryKey> {
  return {
    queryKey: cmsKeys.entity(entityType, entityId),
    queryFn: () => fetchEntity(entityType, entityId),
    // Opening/reloading is explicit. Mounting the observer after an explicit
    // load must not trigger a duplicate request or replace a dirty draft.
    staleTime: Number.POSITIVE_INFINITY,
  };
}
