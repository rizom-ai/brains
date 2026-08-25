/** @jsxImportSource react */
import type {
  RuntimeOperatorActionControl,
  RuntimeOperatorLaunchIntent,
} from "@brains/plugins";
import type { AuthAccountRole } from "@brains/auth-service/account-contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  type ReactElement,
} from "react";
import {
  studioCollectionPath,
  studioCreatePath,
  studioEntityPath,
  studioWorkspacePath,
  parseStudioPath,
} from "../../src/studio-paths";
import { createStudioCreatePrefillState } from "../../src/create-prefill-contract";
import {
  STUDIO_ACCOUNT_WORKSPACE_ID,
  STUDIO_ACCOUNT_WORKSPACE_RENDERER,
} from "../../src/account-workspace";
import {
  StudioAccountWorkspaceView,
  StudioAppStatus,
  StudioAppView,
  type MobileEditorPane,
} from "./app-view";
import {
  ApiError,
  requestFieldAssist,
  type AgentTarget,
  type StudioWorkspaceInfo,
  type FieldAssistResponse,
  type PublishingAction,
  type PublishingActionResult,
} from "./api";
import type { BodyMode } from "./body-editor";
import {
  getStudioRouterBasePath,
  resolveStudioHomePath,
} from "./studio-router";
import { createEditorDocument } from "./editor-document";
import {
  consumeStudioCreatePrefill,
  createPrefilledDraft,
  withoutStudioCreatePrefill,
} from "./create-prefill";
import {
  visibleFieldValues,
  type FieldAssistState,
  type FieldAssistVariant,
} from "./entity-fields";
import {
  editorWorkflowReducer,
  hasUnsavedEditorChanges,
  initialEditorWorkflowState,
  type SaveState,
} from "./editor-workflow";
import { derivePipeline } from "./editor-status";
import {
  removeEntity,
  runDeclarativeWorkspaceAction,
  saveEntity,
  type SaveEntityInput,
} from "./mutations";
import { createInboxChatPrefillState } from "./operator-launch";
import {
  isPublishConfirmation,
  isPublishingActionError,
} from "./publication-actions";
import {
  agentTargetsQueryOptions,
  studioKeys,
  entityDetailQueryOptions,
  entityListQueryOptions,
  entitySchemaQueryOptions,
  invalidateAfterWorkspaceAction,
  navigationQueryOptions,
  syncStatusQueryOptions,
  workspaceQueryOptions,
  type StudioWorkspaceQuery,
} from "./queries";
import { emptyDraft, errorMessage } from "./ui-utils";
import {
  initialWorkspaceUrlQuery,
  replaceWorkspaceUrlQuery,
  workspaceUrlHref,
  workspaceUrlSearch,
} from "./workspace-url-query";

const LazyAccountApp = lazy(async () => {
  const module = await import("./account/account-view");
  return { default: module.AccountApp };
});

const EMPTY_AGENT_TARGETS: AgentTarget[] = [];
const EMPTY_WORKSPACES: StudioWorkspaceInfo[] = [];
const EMPTY_WORKSPACE_QUERY: StudioWorkspaceQuery = {};

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

interface WorkspaceQueryState {
  query: StudioWorkspaceQuery;
  urlSearch?: string | undefined;
}

function consoleSurfaceHref(id: "web-chat"): string | undefined {
  return (
    document
      .querySelector(`[data-console-surface="${id}"]`)
      ?.getAttribute("href") ?? undefined
  );
}

export function App(): ReactElement {
  const router = useRouter();
  const routePathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const routeSearch = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const studioBasePath = getStudioRouterBasePath();
  // TanStack Router exposes a pathname relative to its configured basepath.
  const routeTarget = useMemo(
    () => parseStudioPath(routePathname, "/"),
    [routePathname],
  );
  const createMode = useMemo(
    () =>
      routeTarget.kind === "collection" &&
      new URLSearchParams(routeSearch).get("mode") === "create",
    [routeSearch, routeTarget],
  );
  const currentStudioPathname = useMemo(
    () =>
      routePathname === "/"
        ? studioBasePath
        : `${studioBasePath === "/" ? "" : studioBasePath}${routePathname}`,
    [studioBasePath, routePathname],
  );
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
  const { mode, draft, body, save: saveState } = editor;
  const hasUnsavedChanges = hasUnsavedEditorChanges(editor);
  const navigationBlocker = useBlocker({
    shouldBlockFn: () => hasUnsavedChanges,
    enableBeforeUnload: hasUnsavedChanges,
    withResolver: true,
  });
  const [fieldAssistState, setFieldAssistState] = useState<FieldAssistState>({
    kind: "idle",
  });
  const [bodyMode, setBodyMode] = useState<BodyMode>("split");
  const [mobilePane, setMobilePane] = useState<MobileEditorPane>("details");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [baselineCommit, setBaselineCommit] = useState<string | null>(null);
  const saveStartedAt = useRef(0);
  const pendingOpenState = useRef<{
    pathname: string;
    save: SaveState;
  } | null>(null);
  const openRequestId = useRef(0);
  const selectedEntityTypeRef = useRef(entityType);
  selectedEntityTypeRef.current = entityType;
  const queryClient = useQueryClient();
  const navigationQuery = useQuery(navigationQueryOptions());
  const types = navigationQuery.data?.types ?? null;
  const activeType = types?.find((info) => info.entityType === entityType);
  const activeCapabilities = activeType?.capabilities;
  const workspaces = navigationQuery.data?.workspaces ?? EMPTY_WORKSPACES;
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );
  const activeAccount =
    activeWorkspace?.rendererName === STUDIO_ACCOUNT_WORKSPACE_RENDERER;
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
    ...workspaceQueryOptions(activeWorkspaceId ?? "", workspaceRequestQuery),
    enabled: activeDeclarativeWorkspace,
  });
  const workspaceResponse = workspaceQuery.data ?? null;
  const workspaceData = workspaceResponse?.data ?? null;
  const workspaceError = workspaceQuery.error
    ? errorMessage(workspaceQuery.error)
    : null;
  const activeEntityId = mode.kind === "edit" ? mode.entity.id : null;
  const agentTargetsQuery = useQuery({
    ...agentTargetsQueryOptions(entityType ?? "", activeEntityId ?? ""),
    enabled:
      entityType !== null &&
      activeEntityId !== null &&
      activeCapabilities?.canAssist === true &&
      activeCapabilities.canUpdate,
  });
  const agentTargets = agentTargetsQuery.data ?? EMPTY_AGENT_TARGETS;
  const syncStatusQuery = useQuery({
    ...syncStatusQueryOptions(),
    enabled: entityType !== null,
  });
  const syncStatus = syncStatusQuery.data ?? null;
  const entityListQuery = useQuery({
    ...entityListQueryOptions(entityType ?? ""),
    enabled: entityType !== null,
  });
  const entities = entityType ? (entityListQuery.data ?? null) : null;
  const entitySchemaQuery = useQuery({
    ...entitySchemaQueryOptions(entityType ?? ""),
    enabled: entityType !== null,
  });
  const schema = entityType ? (entitySchemaQuery.data ?? null) : null;
  useQuery({
    ...entityDetailQueryOptions(entityType ?? "", activeEntityId ?? ""),
    enabled: entityType !== null && activeEntityId !== null,
  });
  const saveEntityMutation = useMutation({ mutationFn: saveEntity });
  const deleteEntityMutation = useMutation({ mutationFn: removeEntity });
  const declarativeWorkspaceActionMutation = useMutation({
    mutationFn: runDeclarativeWorkspaceAction,
  });
  const deleting = deleteEntityMutation.isPending;
  const declarativeWorkspaceData =
    activeDeclarativeWorkspace && workspaceResponse
      ? workspaceResponse.data
      : null;

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
      openRequestId.current += 1;
      setLoadError(`Studio route not found: ${routeTarget.pathname}`);
      return;
    }

    if (routeTarget.kind === "workspace") {
      const workspace = workspaces.find(
        (entry) => entry.id === routeTarget.workspaceId,
      );
      if (!workspace) {
        openRequestId.current += 1;
        setLoadError(`Unknown Studio workspace: ${routeTarget.workspaceId}`);
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
      openRequestId.current += 1;
      setLoadError(`Unknown Studio entity type: ${requestedType}`);
      return;
    }

    setActiveWorkspaceId(null);
    setEntityType(nextType);
  }, [routeTarget, router.history, studioBasePath, types, workspaces]);

  // After a save, poll the pipeline until the auto-commit lands. Every poll
  // updates syncStatus, which re-runs this effect until the view settles or
  // the save is 20s old (a byte-identical save never produces a new commit).
  useEffect(() => {
    if (saveState.kind !== "saved" || !syncStatus?.git) return undefined;
    const view = derivePipeline({
      save: saveState,
      git: syncStatus.git,
      baselineCommit,
    });
    if (view.committed === "done") return undefined;
    if (Date.now() - saveStartedAt.current > 20_000) return undefined;
    const timer = window.setTimeout(() => {
      void queryClient.invalidateQueries({
        queryKey: studioKeys.syncStatus(),
      });
    }, 900);
    return (): void => window.clearTimeout(timer);
  }, [saveState, syncStatus, baselineCommit, queryClient]);

  useEffect(() => {
    if (
      !entityType ||
      routeTarget.kind === "workspace" ||
      routeTarget.kind === "not-found"
    ) {
      return;
    }
    const routeEntityId =
      routeTarget.kind === "entity" && routeTarget.entityType === entityType
        ? routeTarget.id
        : null;
    const requestId = ++openRequestId.current;
    dispatchEditor({ type: "collectionChanged" });
    setMobilePane("details");
    setFieldAssistState({ kind: "idle" });
    let active = true;
    Promise.all([
      queryClient.fetchQuery({
        ...entitySchemaQueryOptions(entityType),
        staleTime: 0,
      }),
      queryClient.ensureQueryData(entityListQueryOptions(entityType)),
    ])
      .then(([loadedSchema, loadedEntities]) => {
        if (!active || requestId !== openRequestId.current) return undefined;
        if (createMode && routeEntityId === null) {
          const canCreateRequestedType =
            types?.find((info) => info.entityType === entityType)?.capabilities
              .canCreate === true;
          if (!canCreateRequestedType) {
            setLoadError(`Creating ${entityType} is not allowed.`);
            return undefined;
          }
          const prefill = consumeStudioCreatePrefill(
            window.history.state,
            entityType,
            () =>
              window.history.replaceState(
                withoutStudioCreatePrefill(
                  window.history.state as Record<string, unknown>,
                ),
                "",
                window.location.href,
              ),
          );
          const next = createPrefilledDraft(loadedSchema.fields, prefill);
          dispatchEditor({
            type: "creationStarted",
            draft: next.draft,
            body: next.body,
          });
          return undefined;
        }
        if (routeEntityId !== null) {
          return queryClient
            .fetchQuery({
              ...entityDetailQueryOptions(entityType, routeEntityId),
              staleTime: 0,
            })
            .then((entity) => {
              if (!active || requestId !== openRequestId.current) return;
              const document = createEditorDocument(entity);
              const pending = pendingOpenState.current;
              const nextSave: SaveState =
                pending?.pathname === currentStudioPathname
                  ? pending.save
                  : { kind: "idle" };
              if (pending?.pathname === currentStudioPathname) {
                pendingOpenState.current = null;
              }
              dispatchEditor({
                type: "documentOpened",
                document,
                save: nextSave,
              });
            });
        }
        // Singletons skip the list: open the record, or start creating it.
        if (loadedSchema.isSingleton) {
          const record = loadedEntities[0];
          if (record) {
            return queryClient
              .fetchQuery({
                ...entityDetailQueryOptions(entityType, record.id),
                staleTime: 0,
              })
              .then((entity) => {
                if (!active || requestId !== openRequestId.current) return;
                const document = createEditorDocument(entity);
                dispatchEditor({ type: "documentOpened", document });
              });
          }
          dispatchEditor({
            type: "creationStarted",
            draft: emptyDraft(loadedSchema.fields),
          });
        }
        return undefined;
      })
      .catch((error: unknown) => {
        if (active && requestId === openRequestId.current) {
          setLoadError(errorMessage(error));
        }
      });
    return (): void => {
      active = false;
    };
  }, [
    createMode,
    currentStudioPathname,
    entityType,
    queryClient,
    routePathname,
    routeTarget,
    types,
  ]);

  const openEntity = useCallback(
    (id: string, nextState: SaveState = { kind: "idle" }): void => {
      if (!entityType) return;
      const pathname = studioEntityPath(studioBasePath, entityType, id);
      if (pathname !== currentStudioPathname) {
        pendingOpenState.current = { pathname, save: nextState };
        router.history.push(
          pathname,
          {
            studioCollectionPath: studioCollectionPath(
              studioBasePath,
              entityType,
            ),
          },
          nextState.kind === "saved" ? { ignoreBlocker: true } : undefined,
        );
        return;
      }
      const requestId = ++openRequestId.current;
      const requestedType = entityType;
      queryClient
        .fetchQuery({
          ...entityDetailQueryOptions(entityType, id),
          staleTime: 0,
        })
        .then((entity) => {
          if (
            requestId !== openRequestId.current ||
            selectedEntityTypeRef.current !== requestedType
          ) {
            return;
          }
          const document = createEditorDocument(entity);
          dispatchEditor({
            type: "documentOpened",
            document,
            save: nextState,
          });
          setFieldAssistState({ kind: "idle" });
        })
        .catch((error: unknown) => {
          if (requestId === openRequestId.current) {
            setLoadError(errorMessage(error));
          }
        });
    },
    [
      studioBasePath,
      currentStudioPathname,
      entityType,
      queryClient,
      router.history,
    ],
  );

  const openWorkspaceEntity = useCallback(
    (nextEntityType: string, id: string): void => {
      const pathname = studioEntityPath(studioBasePath, nextEntityType, id);
      pendingOpenState.current = { pathname, save: { kind: "idle" } };
      router.history.push(pathname, {
        studioCollectionPath: studioCollectionPath(
          studioBasePath,
          nextEntityType,
        ),
      });
    },
    [studioBasePath, router.history],
  );

  const captureInboxAsNote = useCallback(
    (
      title: string,
      summary: string | undefined,
      entityType: string,
      entityId: string,
    ): void => {
      router.history.push(
        studioCreatePath(studioBasePath, "note"),
        createStudioCreatePrefillState(
          title,
          `entity://${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
          summary,
        ),
      );
    },
    [studioBasePath, router.history],
  );

  const discussInboxInChat = useCallback(
    (sourceId: string, itemId: string, label: string): void => {
      const href = consoleSurfaceHref("web-chat");
      if (!href) return;
      window.history.pushState(
        createInboxChatPrefillState(sourceId, itemId, label),
        "",
        href,
      );
      window.location.reload();
    },
    [],
  );

  const openWorkspaceLaunch = useCallback(
    (launch: RuntimeOperatorLaunchIntent): void => {
      switch (launch.target) {
        case "account-settings": {
          router.history.push(
            studioWorkspacePath(studioBasePath, STUDIO_ACCOUNT_WORKSPACE_ID),
          );
          return;
        }
        case "invitations":
          router.history.push(
            studioWorkspacePath(studioBasePath, "admin:invitations"),
          );
          return;
        case "admin-peer-invite": {
          router.history.push(
            workspaceUrlHref(
              studioWorkspacePath(studioBasePath, "admin:peers"),
              {
                peerId: launch.peerId,
                displayName: launch.displayName,
              },
            ),
          );
          return;
        }
        case "inbox": {
          const query: Record<string, string> = {};
          if ("source" in launch) {
            query["sourceId"] = "mail-items";
            if (launch.filter === "high-priority") {
              query["facet.mail-priority"] = "high";
            } else if (launch.filter === "needs-reply") {
              query["facet.needs-reply"] = "true";
            } else if (launch.filter === "unclassified") {
              query["facet.category"] = "unclassified";
            }
          }
          router.history.push(
            workspaceUrlHref(
              studioWorkspacePath(studioBasePath, "unified-inbox:inbox"),
              query,
            ),
          );
          return;
        }
        case "publishing":
          router.history.push(
            studioWorkspacePath(studioBasePath, "content-pipeline:publishing"),
          );
          return;
        case "site":
          router.history.push(
            studioWorkspacePath(studioBasePath, "site-builder:site"),
          );
          return;
        case "inbox-open-entity":
          openWorkspaceEntity(launch.entityType, launch.entityId);
          return;
        case "inbox-capture-note":
          captureInboxAsNote(
            launch.title,
            launch.summary,
            launch.entityType,
            launch.entityId,
          );
          return;
        case "inbox-discuss-in-chat":
          discussInboxInChat(launch.sourceId, launch.itemId, launch.label);
      }
    },
    [
      captureInboxAsNote,
      studioBasePath,
      discussInboxInChat,
      openWorkspaceEntity,
      routeSearch,
      router.history,
    ],
  );

  const selectEntityType = useCallback(
    (nextEntityType: string): void => {
      router.history.push(studioCollectionPath(studioBasePath, nextEntityType));
    },
    [studioBasePath, router.history],
  );

  const selectWorkspace = useCallback(
    (workspaceId: string): void => {
      router.history.push(studioWorkspacePath(studioBasePath, workspaceId));
    },
    [studioBasePath, router.history],
  );

  const startCreate = useCallback((): void => {
    if (!schema || activeCapabilities?.canCreate !== true) return;
    dispatchEditor({
      type: "creationStarted",
      draft: emptyDraft(schema.fields),
    });
    setFieldAssistState({ kind: "idle" });
  }, [activeCapabilities, schema]);

  const backToList = useCallback((): void => {
    if (!entityType) return;
    const collectionPath = studioCollectionPath(studioBasePath, entityType);
    const historyState: unknown = router.history.location.state;
    if (
      typeof historyState === "object" &&
      historyState !== null &&
      "studioCollectionPath" in historyState &&
      historyState.studioCollectionPath === collectionPath &&
      router.history.canGoBack()
    ) {
      router.history.back();
      return;
    }
    router.history.replace(collectionPath);
  }, [studioBasePath, entityType, router.history]);

  const runFieldAssist = useCallback(
    (variant: FieldAssistVariant, field: string): void => {
      if (
        !entityType ||
        mode.kind !== "edit" ||
        activeCapabilities?.canUpdate !== true ||
        activeCapabilities.canAssist !== true ||
        body.trim().length === 0
      )
        return;
      setFieldAssistState({ kind: "loading", field, variant });
      requestFieldAssist({
        variant,
        entityType,
        id: mode.entity.id,
        targetField: field,
      })
        .then((response: FieldAssistResponse) => {
          const suggestion =
            response.variant === "summarise"
              ? response.suggestion
              : response.suggestions;
          setFieldAssistState({
            kind: "suggested",
            field: response.targetField,
            variant: response.variant,
            suggestion,
          });
        })
        .catch((error: unknown) => {
          setFieldAssistState({
            kind: "error",
            field,
            message: errorMessage(error),
          });
        });
    },
    [activeCapabilities, body, entityType, mode],
  );

  const applyFieldAssist = useCallback(
    (field: string, suggestion: string | string[]): void => {
      dispatchEditor({ type: "fieldAssistApplied", field, suggestion });
      setFieldAssistState({ kind: "idle" });
    },
    [],
  );

  const save = useCallback((): void => {
    if (!entityType || mode.kind === "browse" || !schema) return;
    if (
      mode.kind === "create"
        ? activeCapabilities?.canCreate !== true
        : activeCapabilities?.canUpdate !== true
    ) {
      return;
    }
    saveStartedAt.current = Date.now();
    setBaselineCommit(syncStatus?.git?.lastCommit ?? null);
    dispatchEditor({ type: "saveStarted" });
    const bodyPayload = schema.hasBody ? { body } : {};
    const frontmatter = visibleFieldValues(schema.fields, draft);
    const input: SaveEntityInput =
      mode.kind === "create"
        ? {
            kind: "create",
            entityType,
            frontmatter,
            ...bodyPayload,
          }
        : {
            kind: "update",
            entityType,
            id: mode.entity.id,
            frontmatter,
            baseContentHash: mode.entity.contentHash,
            ...bodyPayload,
          };
    saveEntityMutation.mutate(input, {
      onSuccess: async (result) => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: studioKeys.entities(entityType),
          }),
          queryClient.invalidateQueries({
            queryKey: studioKeys.syncStatus(),
          }),
        ]);
        const noop = "skipped" in result && result.skipped === true;
        // Re-fetch after every save so the next edit carries a fresh
        // contentHash precondition.
        openEntity(result.entityId, { kind: "saved", noop });
      },
      onError: (error: Error) => {
        dispatchEditor({
          type: "saveFailed",
          save:
            error instanceof ApiError && error.status === 409
              ? { kind: "conflict", message: errorMessage(error) }
              : { kind: "error", message: errorMessage(error) },
        });
      },
    });
  }, [
    activeCapabilities,
    entityType,
    mode,
    draft,
    body,
    schema,
    openEntity,
    syncStatus,
    queryClient,
    saveEntityMutation,
  ]);

  const remove = useCallback((): void => {
    if (
      !entityType ||
      mode.kind !== "edit" ||
      deleting ||
      activeCapabilities?.canDelete !== true
    )
      return;
    const { id } = mode.entity;
    // Recoverable downstream: the delete is exported and committed, so the
    // file remains in git history.
    deleteEntityMutation.mutate(
      { entityType, id },
      {
        onSuccess: async () => {
          dispatchEditor({ type: "deleteSucceeded" });
          queryClient.removeQueries({
            queryKey: studioKeys.entity(entityType, id),
          });
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: studioKeys.entities(entityType),
            }),
            queryClient.invalidateQueries({
              queryKey: studioKeys.syncStatus(),
            }),
          ]);
          router.history.replace(
            studioCollectionPath(studioBasePath, entityType),
            undefined,
            { ignoreBlocker: true },
          );
        },
        onError: (error: Error) => {
          dispatchEditor({
            type: "deleteFailed",
            message: errorMessage(error),
          });
        },
      },
    );
  }, [
    activeCapabilities,
    studioBasePath,
    entityType,
    mode,
    deleting,
    queryClient,
    deleteEntityMutation,
    router.history,
  ]);

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

  const changeWorkspaceQuery = useCallback(
    (
      workspaceId: string,
      query: StudioWorkspaceQuery,
      canonicalUrlQuery?: StudioWorkspaceQuery,
    ): void => {
      const workspace = workspaces.find((entry) => entry.id === workspaceId);
      let urlSearch = workspace?.urlQuery === true ? routeSearch : undefined;
      if (workspace?.urlQuery === true && canonicalUrlQuery !== undefined) {
        const pathname = studioWorkspacePath(studioBasePath, workspaceId);
        urlSearch = workspaceUrlSearch(canonicalUrlQuery);
        replaceWorkspaceUrlQuery(
          router.history,
          pathname,
          canonicalUrlQuery,
          window.location.pathname,
        );
      }
      setWorkspaceQueries((current) => ({
        ...current,
        [workspaceId]: {
          query,
          ...(urlSearch !== undefined ? { urlSearch } : {}),
        },
      }));
    },
    [studioBasePath, routeSearch, router.history, workspaces],
  );

  const visibleLoadError =
    loadError ??
    (navigationQuery.error ? errorMessage(navigationQuery.error) : null);

  if (visibleLoadError) {
    return <StudioAppStatus message={visibleLoadError} error />;
  }
  if (!types) {
    return <StudioAppStatus message="Loading…" />;
  }
  if (activeAccount) {
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
        <Suspense fallback={<p className="status">Opening Account…</p>}>
          <LazyAccountApp
            bootstrap={accountBootstrap(accountPath, studioBasePath)}
          />
        </Suspense>
      </StudioAccountWorkspaceView>
    );
  }
  if (
    activeWorkspaceId
      ? !workspaceData && !workspaceError
      : entityType && (!schema || !entities)
  ) {
    return <StudioAppStatus message="Loading…" />;
  }
  if (!activeWorkspaceId && (!entityType || !schema)) {
    return (
      <StudioAppStatus message="No editable entity types are registered." />
    );
  }

  return (
    <StudioAppView
      activeWorkspaceId={activeWorkspaceId}
      types={types}
      workspaces={workspaces}
      workspaceError={workspaceError}
      declarativeWorkspaceData={declarativeWorkspaceData}
      workspaceQuery={workspaceRequestQuery}
      entityType={entityType}
      entities={entities}
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
      setMobilePane={setMobilePane}
      backToList={backToList}
      selectEntityType={selectEntityType}
      selectWorkspace={selectWorkspace}
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
