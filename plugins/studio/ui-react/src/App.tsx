/** @jsxImportSource react */
import { StudioStatus } from "./studio-status";
import { ConfirmDialog } from "@brains/app-ui-react";
import {
  StudioChatDraftStore,
  shouldBlockChatNavigation,
  type StudioChatNavigationState,
} from "./studio-chat-drafts";
import type { AuthAccountRole } from "@brains/auth-service/account-contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useBlocker, useRouter, useRouterState } from "@tanstack/react-router";
import {
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import {
  studioCollectionPath,
  studioWorkspacePath,
  parseStudioPath,
} from "../../src/studio-paths";
import type { StudioCollectionQuery } from "../../src/collection-query";
import { STUDIO_ACCOUNT_WORKSPACE_ID } from "../../src/account-workspace";
import {
  STUDIO_CHAT_ROUTE_PATH,
  STUDIO_CHAT_WORKSPACE_ID,
} from "../../src/chat-workspace";
import {
  StudioAccountWorkspaceView,
  StudioAppStatus,
  StudioAppView,
  type MobileEditorPane,
} from "./app-view";
import type { BodyMode } from "./body-editor";
import { getStudioRouterBasePath } from "./studio-router";
import { type FieldAssistState } from "./entity-fields";
import {
  editorWorkflowReducer,
  hasUnsavedEditorChanges,
  initialEditorWorkflowState,
} from "./editor-workflow";
import { useStudioApi } from "./studio-api-context";
import { readStudioChatHandoffState } from "./operator-launch";
import { readErrorMessage } from "./read-error";

import { collectionSearch } from "./collection-url-query";

import { useStudioData, type WorkspaceQueryState } from "./use-studio-data";

import { useStudioNavigationActions } from "./use-studio-navigation-actions";

import { useEntityOpener } from "./use-entity-opener";

import { useEditorActions } from "./use-editor-actions";

import { useStudioRouteEffects } from "./use-studio-route-effects";

import { useWorkspaceActions } from "./use-workspace-actions";

const LazyAccountApp = lazy(async () => {
  const module = await import("./account/account-view");
  return { default: module.AccountApp };
});

const LazyStudioChatWorkspace = lazy(async () => {
  const module = await import("./studio-chat-workspace");
  return { default: module.StudioChatWorkspace };
});

export function studioChatSessionId(rawSearch: string): string | null {
  const value = new URLSearchParams(rawSearch).get("session")?.trim();
  return value && value.length <= 256 ? value : null;
}

const ACCOUNT_ROLES: readonly AuthAccountRole[] = [
  "public",
  "trusted",
  "admin",
];

function accountBootstrap(
  routePath: string,
  studioPath: string,
): {
  displayName: string;
  role: AuthAccountRole;
  routePath: string;
  studioPath: string;
} {
  const root = document.querySelector("[data-studio-root]");
  const displayName =
    root?.getAttribute("data-studio-principal-name") ?? "Your account";
  const rawRole = root?.getAttribute("data-studio-principal-role");
  const role =
    ACCOUNT_ROLES.find((candidate) => candidate === rawRole) ?? "public";
  return { displayName, role, routePath, studioPath };
}

export function App(): ReactElement {
  const router = useRouter();
  const routePathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const routeSearch = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const routeState = useRouterState({
    select: (state) => state.location.state,
  });
  const studioBasePath = getStudioRouterBasePath();
  const routeTarget = useMemo(
    () =>
      routePathname === STUDIO_CHAT_ROUTE_PATH
        ? ({
            kind: "workspace",
            workspaceId: STUDIO_CHAT_WORKSPACE_ID,
          } as const)
        : parseStudioPath(routePathname, studioBasePath),
    [routePathname, studioBasePath],
  );
  const createMode = useMemo(
    () =>
      routeTarget.kind === "collection" &&
      new URLSearchParams(routeSearch).get("mode") === "create",
    [routeSearch, routeTarget],
  );
  const currentStudioPathname = routePathname;
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    null,
  );
  const [entityType, setEntityType] = useState<string | null>(null);

  // Renderer-agnostic per-workspace query params (filters, paging). Renderers
  // own their query semantics; the container only stores and forwards them.
  const [workspaceQueries, setWorkspaceQueries] = useState<
    Record<string, WorkspaceQueryState>
  >({});
  const [editor, dispatchEditor] = useReducer(
    editorWorkflowReducer,
    initialEditorWorkflowState,
  );
  const { mode } = editor;
  const hasUnsavedChanges = hasUnsavedEditorChanges(editor);
  const [chatDraftStore] = useState(() => new StudioChatDraftStore());
  const hasChatDrafts = useSyncExternalStore(
    chatDraftStore.subscribe,
    chatDraftStore.hasDrafts,
    chatDraftStore.hasDrafts,
  );
  const [chatNavigation, setChatNavigation] =
    useState<StudioChatNavigationState>({ hasDraft: false, busy: false });
  const navigationBlocker = useBlocker({
    shouldBlockFn: ({ next }) =>
      hasUnsavedChanges ||
      (routePathname === STUDIO_CHAT_ROUTE_PATH &&
        shouldBlockChatNavigation(
          { ...chatNavigation, hasDraft: hasChatDrafts },
          next.pathname,
        )),
    enableBeforeUnload:
      hasUnsavedChanges || hasChatDrafts || chatNavigation.busy,
    withResolver: true,
  });
  const [fieldAssistState, setFieldAssistState] = useState<FieldAssistState>({
    kind: "idle",
  });
  const [bodyMode, setBodyMode] = useState<BodyMode>("preview");
  const [mobilePane, setMobilePane] = useState<MobileEditorPane>("details");
  const preferredMobilePane = useRef<MobileEditorPane | null>(null);
  const selectMobilePane = useCallback((pane: MobileEditorPane): void => {
    preferredMobilePane.current = pane;
    setMobilePane(pane);
  }, []);
  const queryClient = useQueryClient();
  const api = useStudioApi();
  const {
    navigationQuery,
    types,
    activeType,
    activeCapabilities,
    entityCollectionQuery,
    entityListOffset,
    workspaces,
    activeWorkspace,
    activeAccount,
    activeChat,
    initialUrlWorkspaceQuery,
    workspaceRequestQuery,
    workspaceQuery,
    workspaceData,
    workspaceError,
    agentTargets,
    syncStatus,
    entityListQuery,
    entities,
    entityListTotal,
    schema,
    createPath,
    destinationQuery,
    saveEntityMutation,
    deleteEntityMutation,
    declarativeWorkspaceActionMutation,
    deleting,
    declarativeWorkspaceData,
  } = useStudioData({
    api,
    entityType,
    activeWorkspaceId,
    routeSearch,
    workspaceQueries,
    editor,
  });
  const {
    openEntity,
    loadError,
    setLoadError,
    retryOpen,
    supersedeOpen,
    currentOpenRequest,
    pendingOpenState,
  } = useEntityOpener({
    api,
    queryClient,
    history: router.history,
    studioBasePath,
    routeTarget,
    routePathname,
    routeSearch,
    currentStudioPathname,
    createMode,
    entityType,
    activeCapabilities,
    entityCollectionQuery,
    preferredMobilePane,
    dispatchEditor,
    setMobilePane,
    setBodyMode,
    setFieldAssistState,
  });

  useStudioRouteEffects({
    history: router.history,
    queryClient,
    studioBasePath,
    routeTarget,
    routePathname,
    routeSearch,
    entityType,
    activeWorkspaceId,
    types,
    workspaces,
    activeType,
    activeWorkspace,
    entityCollectionQuery,
    entityListOffset,
    entityListTotal,
    declarativeWorkspaceData,
    initialUrlWorkspaceQuery,
    setActiveWorkspaceId,
    setEntityType,
    setLoadError,
    supersedeOpen,
  });

  const {
    openWorkspaceEntity,
    openWorkspaceLaunch,
    selectEntityType,
    changeEntityPage,
    selectWorkspace,
    selectFolder,
    startCreate,
    backToList,
    changeWorkspaceQuery,
  } = useStudioNavigationActions({
    history: router.history,
    studioBasePath,
    routeSearch,
    entityType,
    entityCollectionQuery,
    workspaces,
    schema,
    activeCapabilities,
    pendingOpenState,
    setFieldAssistState,
    setWorkspaceQueries,
  });

  const { runFieldAssist, applyFieldAssist, save, remove, baselineCommit } =
    useEditorActions({
      api,
      queryClient,
      history: router.history,
      studioBasePath,
      entityType,
      entityCollectionQuery,
      activeCapabilities,
      schema,
      editor,
      dispatchEditor,
      createPath,
      syncStatus,
      deleting,
      saveEntityMutation,
      deleteEntityMutation,
      openEntity,
      currentOpenRequest,
      setMobilePane,
      setFieldAssistState,
    });

  const { performPublishingAction, performDeclarativeAction } =
    useWorkspaceActions({
      queryClient,
      workspaces,
      activeWorkspaceId,
      entityType,
      mode,
      declarativeWorkspaceActionMutation,
      openEntity,
    });

  const visibleLoadError =
    loadError ??
    (navigationQuery.error
      ? readErrorMessage(navigationQuery.error)
      : entityListQuery.error
        ? readErrorMessage(entityListQuery.error)
        : null);

  const retryRead = (): void => {
    setLoadError(null);
    if (navigationQuery.error) void navigationQuery.refetch();
    if (entityListQuery.error) void entityListQuery.refetch();
    if (workspaceQuery.error) void workspaceQuery.refetch();
    // Re-run an unsuccessful open, but never replace an already-open draft.
    if (mode.kind === "browse") retryOpen();
  };
  if (visibleLoadError && !types) {
    return (
      <StudioAppStatus message={visibleLoadError} error onRetry={retryRead} />
    );
  }
  if (!types) {
    return <StudioAppStatus message="Loading…" />;
  }
  if (activeAccount && activeWorkspace) {
    const accountPath = studioWorkspacePath(
      studioBasePath,
      STUDIO_ACCOUNT_WORKSPACE_ID,
    );
    return (
      <StudioAccountWorkspaceView
        types={types}
        workspaces={workspaces}
        workspaceId={activeWorkspace.id}
        selectEntityType={selectEntityType}
        selectWorkspace={selectWorkspace}
      >
        <Suspense fallback={<StudioStatus>Opening Account…</StudioStatus>}>
          <LazyAccountApp
            bootstrap={accountBootstrap(accountPath, studioBasePath)}
          />
        </Suspense>
      </StudioAccountWorkspaceView>
    );
  }
  if (activeChat && activeWorkspace) {
    return (
      <>
        <Suspense fallback={<StudioAppStatus message="Opening Chat…" />}>
          <LazyStudioChatWorkspace
            apiPath={activeWorkspace.chatApiPath}
            draftStore={chatDraftStore}
            onNavigationStateChange={setChatNavigation}
            studioBasePath={studioBasePath}
            sessionId={studioChatSessionId(routeSearch)}
            types={types}
            workspaces={workspaces}
            handoff={readStudioChatHandoffState(routeState)}
            navigate={(href, options) => {
              // Acknowledged internal transitions keep drafts intact; work is not abandoned.
              router.history.push(href, undefined, {
                ignoreBlocker: options?.preserveWork === true,
              });
            }}
            selectEntityType={selectEntityType}
            selectWorkspace={selectWorkspace}
          />
        </Suspense>
        {navigationBlocker.status === "blocked" && (
          <ConfirmDialog
            mark="↩"
            title="Leave this conversation?"
            titleId="chat-navigation-title"
            cancelLabel="Stay"
            confirmLabel="Leave"
            onCancel={() => navigationBlocker.reset()}
            onConfirm={() => navigationBlocker.proceed()}
          >
            <p>
              Your draft stays in this tab. Leaving stops receiving the
              response, but does not undo completed actions or background jobs.
            </p>
          </ConfirmDialog>
        )}
      </>
    );
  }
  if (
    activeWorkspaceId
      ? !workspaceData && !workspaceError
      : entityType && !schema && !visibleLoadError
  ) {
    return <StudioAppStatus message="Loading…" />;
  }
  if (!activeWorkspaceId && (!entityType || (!schema && !visibleLoadError))) {
    return (
      <StudioAppStatus
        message={
          visibleLoadError ??
          "No readable collections are available for this account."
        }
        error={Boolean(visibleLoadError)}
        {...(visibleLoadError
          ? { onHome: () => router.history.push(studioBasePath) }
          : {})}
      />
    );
  }

  return (
    <StudioAppView
      activeWorkspaceId={activeWorkspaceId}
      types={types}
      workspaces={workspaces}
      workspaceError={workspaceError}
      readError={visibleLoadError}
      onRetryRead={retryRead}
      declarativeWorkspaceData={declarativeWorkspaceData}
      workspaceQuery={workspaceRequestQuery}
      entityType={entityType}
      entities={entities}
      folders={entityListQuery.data?.folders ?? []}
      collectionPath={
        entityType
          ? studioCollectionPath(studioBasePath, entityType)
          : studioBasePath
      }
      selectFolder={selectFolder}
      creationDestination={{
        data: destinationQuery.data ?? null,
        pending: destinationQuery.isPending,
        error: destinationQuery.error,
      }}
      entityOffset={entityListOffset}
      entityLimit={entityCollectionQuery.limit}
      entityTotal={entityListTotal ?? 0}
      collectionQuery={entityCollectionQuery}
      onCollectionQueryChange={(query: StudioCollectionQuery): void => {
        if (!entityType) return;
        router.history.push(
          `${studioCollectionPath(studioBasePath, entityType)}${collectionSearch({ ...query, offset: 0 })}`,
        );
        window.scrollTo({ top: 0, left: 0 });
      }}
      entityListLoading={entityListQuery.isPending}
      schema={schema}
      editor={editor}
      fieldAssistState={fieldAssistState}
      bodyMode={bodyMode}
      mobilePane={mobilePane}
      syncStatus={syncStatus}
      baselineCommit={baselineCommit}
      agentTargets={agentTargets}
      deleting={deleting}
      hasUnsavedChanges={hasUnsavedChanges}
      navigationBlocked={navigationBlocker.status === "blocked"}
      dispatchEditor={dispatchEditor}
      setFieldAssistState={setFieldAssistState}
      setBodyMode={setBodyMode}
      setMobilePane={selectMobilePane}
      backToList={backToList}
      selectEntityType={selectEntityType}
      selectWorkspace={selectWorkspace}
      changeEntityPage={changeEntityPage}
      openWorkspaceEntity={openWorkspaceEntity}
      openWorkspaceLaunch={openWorkspaceLaunch}
      performPublishingAction={performPublishingAction}
      performDeclarativeAction={performDeclarativeAction}
      onWorkspaceQueryChange={changeWorkspaceQuery}
      startCreate={startCreate}
      openEntity={openEntity}
      runFieldAssist={runFieldAssist}
      applyFieldAssist={applyFieldAssist}
      save={save}
      remove={remove}
      onNavigationReset={() => navigationBlocker.reset?.()}
      onNavigationProceed={() => navigationBlocker.proceed?.()}
    />
  );
}
