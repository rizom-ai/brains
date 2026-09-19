/** @jsxImportSource react */
import { StudioStatus } from "./studio-status";
import { ConfirmDialog } from "@brains/app-ui-react";
import {
  StudioChatDraftStore,
  shouldBlockChatNavigation,
  type StudioChatNavigationState,
} from "./studio-chat-drafts";
import type { RuntimeOperatorActionControl } from "@brains/plugins";
import type { AuthAccountRole } from "@brains/auth-service/account-contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useBlocker, useRouter, useRouterState } from "@tanstack/react-router";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
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
import { type PublishingAction, type PublishingActionResult } from "./api";
import type { BodyMode } from "./body-editor";
import {
  getStudioRouterBasePath,
  resolveStudioHomePath,
  resolveStudioWorkspaceAlias,
} from "./studio-router";
import { type FieldAssistState } from "./entity-fields";
import {
  editorWorkflowReducer,
  hasUnsavedEditorChanges,
  initialEditorWorkflowState,
} from "./editor-workflow";
import { useStudioApi } from "./studio-api-context";
import { readStudioChatHandoffState } from "./operator-launch";
import {
  isPublishConfirmation,
  isPublishingActionError,
} from "./publication-actions";
import { studioKeys, invalidateAfterWorkspaceAction } from "./queries";
import { readErrorMessage } from "./read-error";
import {
  replaceWorkspaceUrlQuery,
  workspaceUrlHref,
} from "./workspace-url-query";

import { collectionSearch } from "./collection-url-query";

import { useStudioData, type WorkspaceQueryState } from "./use-studio-data";

import { useStudioNavigationActions } from "./use-studio-navigation-actions";

import { useEntityOpener } from "./use-entity-opener";

import { useEditorActions } from "./use-editor-actions";

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

  useEffect(() => {
    if (
      !entityType ||
      !activeType ||
      activeWorkspaceId ||
      (routeTarget.kind !== "collection" && routeTarget.kind !== "entity") ||
      routeTarget.entityType !== entityType
    )
      return;
    if (entityListTotal === undefined) return;
    const lastOffset =
      Math.floor(
        Math.max(0, entityListTotal - 1) / entityCollectionQuery.limit,
      ) * entityCollectionQuery.limit;
    if (entityListOffset > lastOffset) {
      router.history.replace(
        `${routePathname}${collectionSearch({ ...entityCollectionQuery, offset: lastOffset })}`,
        router.history.location.state,
      );
    }
  }, [
    activeType,
    activeWorkspaceId,
    entityListOffset,
    entityListTotal,
    entityCollectionQuery,
    entityType,
    routePathname,
    routeTarget,
    router.history,
  ]);

  useEffect(() => {
    if (!activeWorkspaceId || !declarativeWorkspaceData?.refreshAfterMs) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void queryClient.invalidateQueries({
        queryKey: studioKeys.workspace(activeWorkspaceId),
      });
    }, declarativeWorkspaceData.refreshAfterMs);
    return (): void => window.clearTimeout(timer);
  }, [activeWorkspaceId, declarativeWorkspaceData, queryClient]);

  useEffect(() => {
    if (
      activeWorkspace?.urlQuery !== true ||
      routeTarget.kind !== "workspace" ||
      routeTarget.workspaceId !== activeWorkspace.id
    ) {
      return;
    }
    const pathname = studioWorkspacePath(studioBasePath, activeWorkspace.id);
    const canonicalHref = workspaceUrlHref(pathname, initialUrlWorkspaceQuery);
    if (canonicalHref !== `${pathname}${routeSearch}`) {
      replaceWorkspaceUrlQuery(
        router.history,
        pathname,
        initialUrlWorkspaceQuery,
        window.location.pathname,
      );
    }
  }, [
    activeWorkspace,
    studioBasePath,
    initialUrlWorkspaceQuery,
    routeSearch,
    routeTarget,
    router.history,
  ]);

  useEffect(() => {
    if (!types) return;
    setLoadError(null);

    if (routeTarget.kind === "not-found") {
      supersedeOpen();
      setLoadError(`Studio route not found: ${routeTarget.pathname}`);
      return;
    }

    if (routeTarget.kind === "workspace") {
      const workspace = workspaces.find(
        (entry) => entry.id === routeTarget.workspaceId,
      );
      if (!workspace) {
        const aliasHref = resolveStudioWorkspaceAlias(
          studioBasePath,
          routeTarget.workspaceId,
          routeSearch,
          workspaces,
        );
        if (aliasHref) {
          router.history.replace(aliasHref);
          return;
        }
        supersedeOpen();
        setLoadError(
          `Workspace unavailable for this account: ${routeTarget.workspaceId}`,
        );
        return;
      }
      setActiveWorkspaceId(workspace.id);
      setEntityType(null);
      return;
    }

    const requestedType =
      routeTarget.kind === "collection" || routeTarget.kind === "entity"
        ? routeTarget.entityType
        : undefined;
    const first = types.find((info) => !info.isSingleton) ?? types[0];
    if (routeTarget.kind === "home") {
      const homePath = resolveStudioHomePath(studioBasePath, types, workspaces);
      if (homePath !== studioBasePath) {
        router.history.replace(homePath);
        return;
      }
    }
    const nextType = requestedType ?? first?.entityType ?? null;
    if (
      requestedType !== undefined &&
      !types.some((info) => info.entityType === requestedType)
    ) {
      supersedeOpen();
      setLoadError(`Collection unavailable for this account: ${requestedType}`);
      return;
    }

    setActiveWorkspaceId(null);
    setEntityType(nextType);
  }, [
    routeSearch,
    routeTarget,
    router.history,
    studioBasePath,
    types,
    workspaces,
  ]);

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

  const performPublishingAction = useCallback(
    async (action: PublishingAction): Promise<PublishingActionResult> => {
      const capability = workspaces.find(
        (workspace) =>
          workspace.pluginId === "content-pipeline" &&
          workspace.entityTypes.includes(action.entityType),
      );
      if (!capability) throw new Error("Publishing is unavailable");

      const input = {
        entityType: action.entityType,
        entityId: action.entityId,
        ...(action.type === "reorder" ? { position: action.position } : {}),
      };
      if (action.type === "publish" && !action.confirmation) {
        const prepared = await declarativeWorkspaceActionMutation.mutateAsync({
          workspaceId: capability.id,
          action: {
            actionId: "publish",
            label: "Publish now",
            input,
            invocation: { mode: "prepare" },
          },
        });
        if (
          typeof prepared !== "object" ||
          prepared === null ||
          !("kind" in prepared) ||
          prepared.kind !== "prepared-confirmation" ||
          !("token" in prepared) ||
          typeof prepared.token !== "string" ||
          !("summary" in prepared) ||
          typeof prepared.summary !== "string" ||
          !("expiresAt" in prepared) ||
          typeof prepared.expiresAt !== "string"
        ) {
          throw new Error("Publishing confirmation is unavailable");
        }
        return {
          needsConfirmation: true,
          summary: prepared.summary,
          args: {
            confirmed: true,
            confirmationToken: prepared.token,
            contentHash: prepared.token,
            expiresAt: prepared.expiresAt,
          },
        };
      }
      const rawResult = await declarativeWorkspaceActionMutation.mutateAsync({
        workspaceId: capability.id,
        action: {
          actionId: action.type,
          label: action.type,
          input,
          ...(action.type === "publish" && action.confirmation
            ? {
                invocation: {
                  mode: "execute",
                  token: action.confirmation.confirmationToken,
                },
              }
            : {}),
        },
      });
      if (typeof rawResult !== "object" || rawResult === null) {
        throw new Error("Publishing returned an invalid result");
      }
      const result: PublishingActionResult =
        "success" in rawResult && rawResult.success === false
          ? {
              success: false,
              error:
                "error" in rawResult && typeof rawResult.error === "string"
                  ? rawResult.error
                  : "Publishing failed",
              ...("code" in rawResult && typeof rawResult.code === "string"
                ? { code: rawResult.code }
                : {}),
            }
          : { success: true };
      if (!isPublishingActionError(result) && !isPublishConfirmation(result)) {
        await invalidateAfterWorkspaceAction(queryClient, capability.id);
        if (
          mode.kind === "edit" &&
          entityType === action.entityType &&
          mode.entity.id === action.entityId
        ) {
          openEntity(action.entityId);
        }
      }
      return result;
    },
    [
      entityType,
      mode,
      openEntity,
      queryClient,
      declarativeWorkspaceActionMutation,
      workspaces,
    ],
  );

  const performDeclarativeAction = useCallback(
    async (action: RuntimeOperatorActionControl): Promise<unknown> => {
      if (!activeWorkspaceId) {
        throw new Error("Declarative workspace is unavailable");
      }
      try {
        const result = await declarativeWorkspaceActionMutation.mutateAsync({
          workspaceId: activeWorkspaceId,
          action,
        });
        await invalidateAfterWorkspaceAction(queryClient, activeWorkspaceId);
        return result;
      } finally {
        declarativeWorkspaceActionMutation.reset();
      }
    },
    [activeWorkspaceId, declarativeWorkspaceActionMutation, queryClient],
  );

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
