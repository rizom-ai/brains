import type { UseQueryOptions } from "@tanstack/react-query";
import {
  fetchEntities,
  fetchEntity,
  fetchSchema,
  fetchSyncStatus,
  fetchTypes,
  type EntityDetail,
  type EntitySummary,
  type EntityTypeInfo,
  type SyncStatus,
  type TypeSchema,
} from "./api";

export type EntityTypesQueryKey = readonly ["cms", "types"];
export type SyncStatusQueryKey = readonly ["cms", "sync-status"];
export type EntitySchemaQueryKey = readonly ["cms", "schema", string];
export type EntityListQueryKey = readonly ["cms", "entities", string];
export type EntityDetailQueryKey = readonly ["cms", "entity", string, string];

export const cmsKeys = {
  all: ["cms"] as const,
  types: (): EntityTypesQueryKey => ["cms", "types"],
  syncStatus: (): SyncStatusQueryKey => ["cms", "sync-status"],
  schema: (entityType: string): EntitySchemaQueryKey => [
    "cms",
    "schema",
    entityType,
  ],
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

export function entityTypesQueryOptions(): UseQueryOptions<
  EntityTypeInfo[],
  Error,
  EntityTypeInfo[],
  EntityTypesQueryKey
> {
  return {
    queryKey: cmsKeys.types(),
    queryFn: fetchTypes,
  };
}

export function syncStatusQueryOptions(): UseQueryOptions<
  SyncStatus,
  Error,
  SyncStatus,
  SyncStatusQueryKey
> {
  return {
    queryKey: cmsKeys.syncStatus(),
    queryFn: fetchSyncStatus,
  };
}

export function entitySchemaQueryOptions(
  entityType: string,
): UseQueryOptions<TypeSchema, Error, TypeSchema, EntitySchemaQueryKey> {
  return {
    queryKey: cmsKeys.schema(entityType),
    queryFn: () => fetchSchema(entityType),
    // Collection switching explicitly refreshes schemas. Its mounted observer
    // must share that request rather than immediately issuing another.
    staleTime: Number.POSITIVE_INFINITY,
  };
}

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
