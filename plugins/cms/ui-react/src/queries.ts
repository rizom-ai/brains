import type { QueryClient, UseQueryOptions } from "@tanstack/react-query";
import {
  fetchAgentTargets,
  fetchEntities,
  fetchEntity,
  fetchNavigation,
  fetchSchema,
  fetchSyncStatus,
  fetchWorkspace,
  type AgentTarget,
  type CmsNavigation,
  type CmsWorkspaceData,
  type EntityDetail,
  type EntitySummary,
  type SyncStatus,
  type TypeSchema,
} from "./api";

export type NavigationQueryKey = readonly ["cms", "navigation"];
export type CmsWorkspaceQuery = Readonly<
  Record<string, string | number | undefined>
>;
export type WorkspaceQueryKey = readonly [
  "cms",
  "workspace",
  string,
  CmsWorkspaceQuery,
];
export type AgentTargetsQueryKey = readonly [
  "cms",
  "agent-targets",
  string,
  string,
];
export type SyncStatusQueryKey = readonly ["cms", "sync-status"];
export type EntitySchemaQueryKey = readonly ["cms", "schema", string];
export type EntityListQueryKey = readonly ["cms", "entities", string];
export type EntityDetailQueryKey = readonly ["cms", "entity", string, string];

export const cmsKeys = {
  all: (): readonly ["cms"] => ["cms"],
  navigation: (): NavigationQueryKey => ["cms", "navigation"],
  workspaceScope: (
    workspaceId: string,
  ): readonly ["cms", "workspace", string] => ["cms", "workspace", workspaceId],
  workspace: (
    workspaceId: string,
    query: CmsWorkspaceQuery = {},
  ): WorkspaceQueryKey => ["cms", "workspace", workspaceId, query],
  agentTargets: (
    entityType: string,
    entityId: string,
  ): AgentTargetsQueryKey => ["cms", "agent-targets", entityType, entityId],
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

export function navigationQueryOptions(): UseQueryOptions<
  CmsNavigation,
  Error,
  CmsNavigation,
  NavigationQueryKey
> {
  return {
    queryKey: cmsKeys.navigation(),
    queryFn: fetchNavigation,
  };
}

export function workspaceQueryOptions(
  workspaceId: string,
  query: CmsWorkspaceQuery = {},
): UseQueryOptions<
  CmsWorkspaceData,
  Error,
  CmsWorkspaceData,
  WorkspaceQueryKey
> {
  return {
    queryKey: cmsKeys.workspace(workspaceId, query),
    queryFn: () => fetchWorkspace(workspaceId, query),
  };
}

export function invalidateAfterWorkspaceAction(
  queryClient: QueryClient,
  workspaceId: string,
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: cmsKeys.workspaceScope(workspaceId),
  });
}

export async function invalidateAfterUpload(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: cmsKeys.entities("image") }),
    queryClient.invalidateQueries({ queryKey: cmsKeys.navigation() }),
    queryClient.invalidateQueries({ queryKey: cmsKeys.syncStatus() }),
  ]);
}

export function agentTargetsQueryOptions(
  entityType: string,
  entityId: string,
): UseQueryOptions<AgentTarget[], Error, AgentTarget[], AgentTargetsQueryKey> {
  return {
    queryKey: cmsKeys.agentTargets(entityType, entityId),
    queryFn: () => fetchAgentTargets(entityType, entityId),
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
