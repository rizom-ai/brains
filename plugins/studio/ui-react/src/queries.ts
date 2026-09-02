import {
  keepPreviousData,
  type QueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import type {
  StudioApi,
  AgentTarget,
  StudioNavigation,
  StudioWorkspaceData,
  EntityDetail,
  EntitySummary,
  SyncStatus,
  TypeSchema,
} from "./api";

export type NavigationQueryKey = readonly ["studio", "navigation"];
export type StudioWorkspaceQuery = Readonly<
  Record<string, string | number | undefined>
>;
export type WorkspaceQueryKey = readonly [
  "studio",
  "workspace",
  string,
  StudioWorkspaceQuery,
];
export type AgentTargetsQueryKey = readonly [
  "studio",
  "agent-targets",
  string,
  string,
];
export type SyncStatusQueryKey = readonly ["studio", "sync-status"];
export type EntitySchemaQueryKey = readonly ["studio", "schema", string];
export type EntityListQueryKey = readonly ["studio", "entities", string];
export type EntityDetailQueryKey = readonly [
  "studio",
  "entity",
  string,
  string,
];

export const studioKeys = {
  all: (): readonly ["studio"] => ["studio"],
  navigation: (): NavigationQueryKey => ["studio", "navigation"],
  workspaceScope: (
    workspaceId: string,
  ): readonly ["studio", "workspace", string] => [
    "studio",
    "workspace",
    workspaceId,
  ],
  workspace: (
    workspaceId: string,
    query: StudioWorkspaceQuery = {},
  ): WorkspaceQueryKey => ["studio", "workspace", workspaceId, query],
  agentTargets: (
    entityType: string,
    entityId: string,
  ): AgentTargetsQueryKey => ["studio", "agent-targets", entityType, entityId],
  syncStatus: (): SyncStatusQueryKey => ["studio", "sync-status"],
  schema: (entityType: string): EntitySchemaQueryKey => [
    "studio",
    "schema",
    entityType,
  ],
  entities: (entityType: string): EntityListQueryKey => [
    "studio",
    "entities",
    entityType,
  ],
  entity: (entityType: string, entityId: string): EntityDetailQueryKey => [
    "studio",
    "entity",
    entityType,
    entityId,
  ],
};

export function navigationQueryOptions(
  api: StudioApi,
): UseQueryOptions<
  StudioNavigation,
  Error,
  StudioNavigation,
  NavigationQueryKey
> {
  return {
    queryKey: studioKeys.navigation(),
    queryFn: () => api.fetchNavigation(),
  };
}

export function workspaceQueryOptions(
  api: StudioApi,
  workspaceId: string,
  query: StudioWorkspaceQuery = {},
): UseQueryOptions<
  StudioWorkspaceData,
  Error,
  StudioWorkspaceData,
  WorkspaceQueryKey
> {
  return {
    queryKey: studioKeys.workspace(workspaceId, query),
    queryFn: () => api.fetchWorkspace(workspaceId, query),
    // Paged/filtered workspaces change query keys in place; keeping the
    // previous page mounted avoids tearing the renderer down per page, and
    // the modest staleTime stops focus/remount refetch spam. Action paths
    // refresh explicitly through invalidateAfterWorkspaceAction.
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  };
}

export async function invalidateAfterWorkspaceAction(
  queryClient: QueryClient,
  workspaceId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: studioKeys.workspaceScope(workspaceId),
    }),
    // Rail badges ride the navigation payload, so any workspace action can
    // stale them.
    queryClient.invalidateQueries({ queryKey: studioKeys.navigation() }),
  ]);
}

export async function invalidateAfterUpload(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: studioKeys.entities("image") }),
    queryClient.invalidateQueries({ queryKey: studioKeys.navigation() }),
    queryClient.invalidateQueries({ queryKey: studioKeys.syncStatus() }),
  ]);
}

export function agentTargetsQueryOptions(
  api: StudioApi,
  entityType: string,
  entityId: string,
): UseQueryOptions<AgentTarget[], Error, AgentTarget[], AgentTargetsQueryKey> {
  return {
    queryKey: studioKeys.agentTargets(entityType, entityId),
    queryFn: () => api.fetchAgentTargets(entityType, entityId),
  };
}

export function syncStatusQueryOptions(
  api: StudioApi,
): UseQueryOptions<SyncStatus, Error, SyncStatus, SyncStatusQueryKey> {
  return {
    queryKey: studioKeys.syncStatus(),
    queryFn: () => api.fetchSyncStatus(),
  };
}

export function entitySchemaQueryOptions(
  api: StudioApi,
  entityType: string,
): UseQueryOptions<TypeSchema, Error, TypeSchema, EntitySchemaQueryKey> {
  return {
    queryKey: studioKeys.schema(entityType),
    queryFn: () => api.fetchSchema(entityType),
    // Collection switching explicitly refreshes schemas. Its mounted observer
    // must share that request rather than immediately issuing another.
    staleTime: Number.POSITIVE_INFINITY,
  };
}

export function entityListQueryOptions(
  api: StudioApi,
  entityType: string,
): UseQueryOptions<
  EntitySummary[],
  Error,
  EntitySummary[],
  EntityListQueryKey
> {
  return {
    queryKey: studioKeys.entities(entityType),
    queryFn: () => api.fetchEntities(entityType),
  };
}

export function entityDetailQueryOptions(
  api: StudioApi,
  entityType: string,
  entityId: string,
): UseQueryOptions<EntityDetail, Error, EntityDetail, EntityDetailQueryKey> {
  return {
    queryKey: studioKeys.entity(entityType, entityId),
    queryFn: () => api.fetchEntity(entityType, entityId),
    // Opening/reloading is explicit. Mounting the observer after an explicit
    // load must not trigger a duplicate request or replace a dirty draft.
    staleTime: Number.POSITIVE_INFINITY,
  };
}
