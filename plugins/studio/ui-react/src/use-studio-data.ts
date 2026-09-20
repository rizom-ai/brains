import type {
  EntityGrouping,
  EntityIdPath,
  RuntimeStudioWorkspaceData,
} from "@brains/plugins";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { StudioCollectionQuery } from "../../src/collection-query";
import { STUDIO_ACCOUNT_WORKSPACE_RENDERER } from "../../src/account-workspace";
import { STUDIO_CHAT_WORKSPACE_RENDERER } from "../../src/chat-workspace";
import { type AgentTarget, type StudioWorkspaceInfo } from "./api";
import { visibleFieldValues } from "./entity-fields";
import { creationIdPath } from "./editor-workflow";
import {
  removeEntity,
  runDeclarativeWorkspaceAction,
  saveEntity,
  type DeclarativeWorkspaceActionInput,
  type DeleteEntityInput,
  type SaveEntityInput,
  type SaveEntityResult,
} from "./mutations";
import {
  agentTargetsQueryOptions,
  destinationQueryOptions,
  entityDetailQueryOptions,
  entityListQueryOptions,
  entitySchemaQueryOptions,
  navigationQueryOptions,
  syncStatusQueryOptions,
  workspaceQueryOptions,
  type StudioWorkspaceQuery,
} from "./queries";
import { readErrorMessage } from "./read-error";
import { initialWorkspaceUrlQuery } from "./workspace-url-query";

import { collectionQuery } from "./collection-url-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import type {
  DestinationPreview,
  EntityPage,
  EntitySummary,
  EntityTypeInfo,
  StudioNavigation,
  StudioTypeCapabilities,
  StudioWorkspaceData,
  SyncStatus,
  TypeSchema,
} from "./api";
import type { EditorWorkflowState } from "./editor-workflow";
import type { StudioApi } from "./api";

const EMPTY_GROUPINGS: EntityGrouping[] = [];
const EMPTY_AGENT_TARGETS: AgentTarget[] = [];
const EMPTY_WORKSPACES: StudioWorkspaceInfo[] = [];
const EMPTY_WORKSPACE_QUERY: StudioWorkspaceQuery = {};

export interface WorkspaceQueryState {
  query: StudioWorkspaceQuery;
  urlSearch?: string | undefined;
}

export interface StudioDataInput {
  api: StudioApi;
  entityType: string | null;
  activeWorkspaceId: string | null;
  routeSearch: string;
  workspaceQueries: Record<string, WorkspaceQueryState>;
  editor: EditorWorkflowState;
}

/** Everything the Studio container reads from the server for the current route. */
export interface StudioData {
  navigationQuery: UseQueryResult<StudioNavigation, Error>;
  types: EntityTypeInfo[] | null;
  groupings: EntityGrouping[];
  activeType: EntityTypeInfo | undefined;
  activeCapabilities: StudioTypeCapabilities | undefined;
  entityCollectionQuery: StudioCollectionQuery;
  entityListOffset: number;
  workspaces: StudioWorkspaceInfo[];
  activeWorkspace: StudioWorkspaceInfo | undefined;
  activeAccount: boolean;
  activeChat: boolean;
  activeDeclarativeWorkspace: boolean;
  storedWorkspaceQuery: WorkspaceQueryState | undefined;
  storedQueryMatchesLocation: boolean;
  initialUrlWorkspaceQuery: StudioWorkspaceQuery;
  workspaceRequestQuery: StudioWorkspaceQuery;
  workspaceQuery: UseQueryResult<StudioWorkspaceData, Error>;
  workspaceResponse: StudioWorkspaceData | null;
  workspaceData: RuntimeStudioWorkspaceData | null;
  workspaceError: string | null;
  activeEntityId: string | null;
  agentTargetsQuery: UseQueryResult<AgentTarget[], Error>;
  agentTargets: AgentTarget[];
  syncStatusQuery: UseQueryResult<SyncStatus, Error>;
  syncStatus: SyncStatus | null;
  entityListQuery: UseQueryResult<EntityPage, Error>;
  entities: EntitySummary[] | null;
  entityListTotal: number | undefined;
  entitySchemaQuery: UseQueryResult<TypeSchema, Error>;
  schema: TypeSchema | null;
  createPath: EntityIdPath | null;
  destinationQuery: UseQueryResult<DestinationPreview, Error>;
  saveEntityMutation: UseMutationResult<
    SaveEntityResult,
    Error,
    SaveEntityInput
  >;
  deleteEntityMutation: UseMutationResult<
    { deleted: boolean },
    Error,
    DeleteEntityInput
  >;
  declarativeWorkspaceActionMutation: UseMutationResult<
    unknown,
    Error,
    DeclarativeWorkspaceActionInput
  >;
  deleting: boolean;
  declarativeWorkspaceData: RuntimeStudioWorkspaceData | null;
}

export function useStudioData(input: StudioDataInput): StudioData {
  const {
    api,
    entityType,
    activeWorkspaceId,
    routeSearch,
    workspaceQueries,
    editor,
  } = input;
  const { mode, draft, body } = editor;
  const navigationQuery = useQuery(navigationQueryOptions(api));
  const types = navigationQuery.data?.types ?? null;
  const groupings = navigationQuery.data?.groupings ?? EMPTY_GROUPINGS;
  const activeType = types?.find((info) => info.entityType === entityType);
  const activeCapabilities = activeType?.capabilities;
  const entityCollectionQuery = useMemo(
    () =>
      activeType?.isSingleton
        ? collectionQuery("?scope=collection")
        : collectionQuery(routeSearch),
    [activeType?.isSingleton, routeSearch],
  );
  const entityListOffset = entityCollectionQuery.offset;
  const workspaces = navigationQuery.data?.workspaces ?? EMPTY_WORKSPACES;
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );
  const activeAccount =
    activeWorkspace?.rendererName === STUDIO_ACCOUNT_WORKSPACE_RENDERER;
  const activeChat =
    activeWorkspace?.rendererName === STUDIO_CHAT_WORKSPACE_RENDERER;
  const activeDeclarativeWorkspace =
    activeWorkspace?.rendererName === "DeclarativeOperatorWorkspace";
  const storedWorkspaceQuery = activeWorkspaceId
    ? workspaceQueries[activeWorkspaceId]
    : undefined;
  const storedQueryMatchesLocation =
    activeWorkspace?.urlQuery !== true ||
    storedWorkspaceQuery?.urlSearch === routeSearch;
  const initialUrlWorkspaceQuery = useMemo(
    () => initialWorkspaceUrlQuery(activeWorkspace, routeSearch),
    [activeWorkspace, routeSearch],
  );
  const workspaceRequestQuery = activeWorkspaceId
    ? storedWorkspaceQuery && storedQueryMatchesLocation
      ? storedWorkspaceQuery.query
      : initialUrlWorkspaceQuery
    : EMPTY_WORKSPACE_QUERY;
  const workspaceQuery = useQuery({
    ...workspaceQueryOptions(
      api,
      activeWorkspaceId ?? "",
      workspaceRequestQuery,
    ),
    enabled: activeDeclarativeWorkspace,
  });
  const workspaceResponse = workspaceQuery.data ?? null;
  const workspaceData = workspaceResponse?.data ?? null;
  const workspaceError = workspaceQuery.error
    ? readErrorMessage(workspaceQuery.error)
    : null;
  const activeEntityId = mode.kind === "edit" ? mode.entity.id : null;
  const agentTargetsQuery = useQuery({
    ...agentTargetsQueryOptions(api, entityType ?? "", activeEntityId ?? ""),
    enabled:
      entityType !== null &&
      activeEntityId !== null &&
      activeCapabilities?.canAssist === true &&
      activeCapabilities.canUpdate,
  });
  const agentTargets = agentTargetsQuery.data ?? EMPTY_AGENT_TARGETS;
  const syncStatusQuery = useQuery({
    ...syncStatusQueryOptions(api),
    enabled: entityType !== null,
  });
  const syncStatus = syncStatusQuery.data ?? null;
  const entityListQuery = useQuery({
    ...entityListQueryOptions(api, entityType ?? "", entityCollectionQuery),
    enabled: entityType !== null,
  });
  const entities = entityType ? (entityListQuery.data?.entities ?? null) : null;
  const entityListTotal = entityListQuery.data?.total;
  const entitySchemaQuery = useQuery({
    ...entitySchemaQueryOptions(api, entityType ?? ""),
    enabled: entityType !== null,
  });
  const schema = entityType ? (entitySchemaQuery.data ?? null) : null;
  const createPath = creationIdPath(mode);
  const destinationQuery = useQuery(
    destinationQueryOptions(
      api,
      entityType && createPath && mode.kind === "create" && mode.segment
        ? {
            entityType,
            idPath: createPath,
            frontmatter: visibleFieldValues(schema?.fields ?? [], draft),
            ...(schema?.hasBody && { body }),
          }
        : null,
    ),
  );
  useQuery({
    ...entityDetailQueryOptions(api, entityType ?? "", activeEntityId ?? ""),
    enabled: entityType !== null && activeEntityId !== null,
  });
  const saveEntityMutation = useMutation({
    mutationFn: (input: SaveEntityInput): Promise<SaveEntityResult> =>
      saveEntity(api, input),
  });
  const deleteEntityMutation = useMutation({
    mutationFn: (input: DeleteEntityInput): Promise<{ deleted: boolean }> =>
      removeEntity(api, input),
  });
  const declarativeWorkspaceActionMutation = useMutation({
    mutationFn: (input: DeclarativeWorkspaceActionInput): Promise<unknown> =>
      runDeclarativeWorkspaceAction(api, input),
  });
  const deleting = deleteEntityMutation.isPending;
  const declarativeWorkspaceData =
    activeDeclarativeWorkspace && workspaceResponse
      ? workspaceResponse.data
      : null;
  return {
    navigationQuery,
    types,
    groupings,
    activeType,
    activeCapabilities,
    entityCollectionQuery,
    entityListOffset,
    workspaces,
    activeWorkspace,
    activeAccount,
    activeChat,
    activeDeclarativeWorkspace,
    storedWorkspaceQuery,
    storedQueryMatchesLocation,
    initialUrlWorkspaceQuery,
    workspaceRequestQuery,
    workspaceQuery,
    workspaceResponse,
    workspaceData,
    workspaceError,
    activeEntityId,
    agentTargetsQuery,
    agentTargets,
    syncStatusQuery,
    syncStatus,
    entityListQuery,
    entities,
    entityListTotal,
    entitySchemaQuery,
    schema,
    createPath,
    destinationQuery,
    saveEntityMutation,
    deleteEntityMutation,
    declarativeWorkspaceActionMutation,
    deleting,
    declarativeWorkspaceData,
  };
}
