import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useRouter, useRouterState } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactElement,
} from "react";
import {
  cmsCollectionPath,
  cmsEntityPath,
  cmsWorkspacePath,
  parseCmsPath,
} from "../../src/cms-paths";
import { CmsAppStatus, CmsAppView, type MobileEditorPane } from "./app-view";
import {
  ApiError,
  requestFieldAssist,
  type AgentTarget,
  type CmsWorkspaceInfo,
  type DirectorySyncWorkspaceActionResult,
  type FieldAssistResponse,
  type PublishingAction,
  type PublishingActionResult,
  type SiteWorkspaceAction,
  type SiteWorkspaceActionResult,
} from "./api";
import type { BodyMode } from "./body-editor";
import { getCmsRouterBasePath } from "./cms-router";
import { createEditorDocument } from "./editor-document";
import type { FieldAssistState, FieldAssistVariant } from "./entity-fields";
import {
  editorWorkflowReducer,
  hasUnsavedEditorChanges,
  initialEditorWorkflowState,
  type SaveState,
} from "./editor-workflow";
import { derivePipeline } from "./editor-status";
import {
  removeEntity,
  runCmsWorkspaceAction,
  runDirectorySyncWorkspaceAction,
  runSiteWorkspaceAction,
  saveEntity,
  type SaveEntityInput,
} from "./mutations";
import {
  isPublishConfirmation,
  isPublishingActionError,
} from "./publishing-workspace";
import {
  agentTargetsQueryOptions,
  cmsKeys,
  entityDetailQueryOptions,
  entityListQueryOptions,
  entitySchemaQueryOptions,
  invalidateAfterWorkspaceAction,
  navigationQueryOptions,
  syncStatusQueryOptions,
  workspaceQueryOptions,
} from "./queries";
import { emptyDraft, errorMessage } from "./ui-utils";

const EMPTY_AGENT_TARGETS: AgentTarget[] = [];
const EMPTY_WORKSPACES: CmsWorkspaceInfo[] = [];

export function App(): ReactElement {
  const router = useRouter();
  const routePathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const cmsBasePath = getCmsRouterBasePath();
  // TanStack Router exposes a pathname relative to its configured basepath.
  const routeTarget = useMemo(
    () => parseCmsPath(routePathname, "/"),
    [routePathname],
  );
  const currentCmsPathname = useMemo(
    () =>
      routePathname === "/"
        ? cmsBasePath
        : `${cmsBasePath === "/" ? "" : cmsBasePath}${routePathname}`,
    [cmsBasePath, routePathname],
  );
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    null,
  );
  const [entityType, setEntityType] = useState<string | null>(null);
  const [editor, dispatchEditor] = useReducer(
    editorWorkflowReducer,
    initialEditorWorkflowState,
  );
  const { mode, draft, body, save: saveState, deleteOpen } = editor;
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
  const workspaces = navigationQuery.data?.workspaces ?? EMPTY_WORKSPACES;
  const workspaceQuery = useQuery({
    ...workspaceQueryOptions(activeWorkspaceId ?? ""),
    enabled: activeWorkspaceId !== null,
  });
  const workspaceResponse = workspaceQuery.data ?? null;
  const workspaceData = workspaceResponse?.data ?? null;
  const workspaceError = workspaceQuery.error
    ? errorMessage(workspaceQuery.error)
    : null;
  const agentTargetsQuery = useQuery(agentTargetsQueryOptions());
  const agentTargets = agentTargetsQuery.data ?? EMPTY_AGENT_TARGETS;
  const syncStatusQuery = useQuery(syncStatusQueryOptions());
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
  const activeEntityId = mode.kind === "edit" ? mode.entity.id : null;
  useQuery({
    ...entityDetailQueryOptions(entityType ?? "", activeEntityId ?? ""),
    enabled: entityType !== null && activeEntityId !== null,
  });
  const saveEntityMutation = useMutation({ mutationFn: saveEntity });
  const deleteEntityMutation = useMutation({ mutationFn: removeEntity });
  const workspaceActionMutation = useMutation({
    mutationFn: runCmsWorkspaceAction,
  });
  const siteWorkspaceActionMutation = useMutation({
    mutationFn: runSiteWorkspaceAction,
  });
  const directorySyncWorkspaceActionMutation = useMutation({
    mutationFn: runDirectorySyncWorkspaceAction,
  });
  const deleting = deleteEntityMutation.isPending;

  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );
  const publicationWorkspaceData =
    activeWorkspace?.rendererName === "PublishingWorkspace" &&
    workspaceResponse?.rendererName === "PublishingWorkspace"
      ? workspaceResponse.data
      : null;
  const siteWorkspaceData =
    activeWorkspace?.rendererName === "SiteWorkspace" &&
    workspaceResponse?.rendererName === "SiteWorkspace"
      ? workspaceResponse.data
      : null;
  const directorySyncWorkspaceData =
    activeWorkspace?.rendererName === "DirectorySyncWorkspace" &&
    workspaceResponse?.rendererName === "DirectorySyncWorkspace"
      ? workspaceResponse.data
      : null;

  useEffect(() => {
    if (!deleteOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !deleting) {
        dispatchEditor({ type: "deleteCancelled" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return (): void => window.removeEventListener("keydown", onKeyDown);
  }, [deleteOpen, deleting]);

  useEffect(() => {
    if (!types) return;
    setLoadError(null);

    if (routeTarget.kind === "not-found") {
      openRequestId.current += 1;
      setLoadError(`CMS route not found: ${routeTarget.pathname}`);
      return;
    }

    if (routeTarget.kind === "workspace") {
      const workspace = workspaces.find(
        (entry) => entry.id === routeTarget.workspaceId,
      );
      if (!workspace) {
        openRequestId.current += 1;
        setLoadError(`Unknown CMS workspace: ${routeTarget.workspaceId}`);
        return;
      }
      setActiveWorkspaceId(workspace.id);
      return;
    }

    const requestedType =
      routeTarget.kind === "collection" || routeTarget.kind === "entity"
        ? routeTarget.entityType
        : undefined;
    const first = types.find((info) => !info.isSingleton) ?? types[0];
    const nextType = requestedType ?? first?.entityType ?? null;
    if (
      requestedType !== undefined &&
      !types.some((info) => info.entityType === requestedType)
    ) {
      openRequestId.current += 1;
      setLoadError(`Unknown CMS entity type: ${requestedType}`);
      return;
    }

    setActiveWorkspaceId(null);
    setEntityType(nextType);
  }, [routeTarget, types, workspaces]);

  useEffect(() => {
    if (!activeWorkspaceId || !siteWorkspaceData) return undefined;
    if (!siteWorkspaceData.environments.some((entry) => entry.active)) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void queryClient.invalidateQueries({
        queryKey: cmsKeys.workspace(activeWorkspaceId),
      });
    }, 1000);
    return (): void => window.clearTimeout(timer);
  }, [activeWorkspaceId, queryClient, siteWorkspaceData]);

  useEffect(() => {
    if (!activeWorkspaceId || !directorySyncWorkspaceData?.activeRun) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void queryClient.invalidateQueries({
        queryKey: cmsKeys.workspace(activeWorkspaceId),
      });
    }, 1000);
    return (): void => window.clearTimeout(timer);
  }, [activeWorkspaceId, directorySyncWorkspaceData, queryClient]);

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
        queryKey: cmsKeys.syncStatus(),
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
              const nextSave =
                pending?.pathname === currentCmsPathname
                  ? pending.save
                  : { kind: "idle" as const };
              if (pending?.pathname === currentCmsPathname) {
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
  }, [currentCmsPathname, entityType, queryClient, routePathname, routeTarget]);

  const openEntity = useCallback(
    (id: string, nextState: SaveState = { kind: "idle" }): void => {
      if (!entityType) return;
      const pathname = cmsEntityPath(cmsBasePath, entityType, id);
      if (pathname !== currentCmsPathname) {
        pendingOpenState.current = { pathname, save: nextState };
        router.history.push(
          pathname,
          {
            cmsCollectionPath: cmsCollectionPath(cmsBasePath, entityType),
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
    [cmsBasePath, currentCmsPathname, entityType, queryClient, router.history],
  );

  const openWorkspaceEntity = useCallback(
    (nextEntityType: string, id: string): void => {
      const pathname = cmsEntityPath(cmsBasePath, nextEntityType, id);
      pendingOpenState.current = { pathname, save: { kind: "idle" } };
      router.history.push(pathname, {
        cmsCollectionPath: cmsCollectionPath(cmsBasePath, nextEntityType),
      });
    },
    [cmsBasePath, router.history],
  );

  const selectEntityType = useCallback(
    (nextEntityType: string): void => {
      router.history.push(cmsCollectionPath(cmsBasePath, nextEntityType));
    },
    [cmsBasePath, router.history],
  );

  const selectWorkspace = useCallback(
    (workspaceId: string): void => {
      router.history.push(cmsWorkspacePath(cmsBasePath, workspaceId));
    },
    [cmsBasePath, router.history],
  );

  const startCreate = useCallback((): void => {
    if (!schema) return;
    dispatchEditor({
      type: "creationStarted",
      draft: emptyDraft(schema.fields),
    });
    setFieldAssistState({ kind: "idle" });
  }, [schema]);

  const backToList = useCallback((): void => {
    if (!entityType) return;
    const collectionPath = cmsCollectionPath(cmsBasePath, entityType);
    const historyState = router.history.location.state as Record<
      string,
      unknown
    >;
    if (
      historyState["cmsCollectionPath"] === collectionPath &&
      router.history.canGoBack()
    ) {
      router.history.back();
      return;
    }
    router.history.replace(collectionPath);
  }, [cmsBasePath, entityType, router.history]);

  const runFieldAssist = useCallback(
    (variant: FieldAssistVariant, field: string): void => {
      if (!entityType || body.trim().length === 0) return;
      setFieldAssistState({ kind: "loading", field, variant });
      requestFieldAssist({
        variant,
        entityType,
        targetField: field,
        body,
        frontmatter: draft,
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
    [body, draft, entityType],
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
    saveStartedAt.current = Date.now();
    setBaselineCommit(syncStatus?.git?.lastCommit ?? null);
    dispatchEditor({ type: "saveStarted" });
    const bodyPayload = schema.hasBody ? { body } : {};
    const input: SaveEntityInput =
      mode.kind === "create"
        ? {
            kind: "create",
            entityType,
            frontmatter: draft,
            ...bodyPayload,
          }
        : {
            kind: "update",
            entityType,
            id: mode.entity.id,
            frontmatter: draft,
            baseContentHash: mode.entity.contentHash,
            ...bodyPayload,
          };
    saveEntityMutation.mutate(input, {
      onSuccess: async (result) => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: cmsKeys.entities(entityType),
          }),
          queryClient.invalidateQueries({
            queryKey: cmsKeys.syncStatus(),
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
    if (!entityType || mode.kind !== "edit" || deleting) return;
    const { id } = mode.entity;
    // Recoverable downstream: the delete is exported and committed, so the
    // file remains in git history.
    deleteEntityMutation.mutate(
      { entityType, id },
      {
        onSuccess: async () => {
          dispatchEditor({ type: "deleteSucceeded" });
          queryClient.removeQueries({
            queryKey: cmsKeys.entity(entityType, id),
          });
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: cmsKeys.entities(entityType),
            }),
            queryClient.invalidateQueries({
              queryKey: cmsKeys.syncStatus(),
            }),
          ]);
          router.history.replace(
            cmsCollectionPath(cmsBasePath, entityType),
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
    cmsBasePath,
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
          workspace.rendererName === "PublishingWorkspace" &&
          workspace.entityTypes.includes(action.entityType),
      );
      if (!capability) throw new Error("Publishing is unavailable");

      const result = await workspaceActionMutation.mutateAsync({
        workspaceId: capability.id,
        action,
      });
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
      workspaceActionMutation,
      workspaces,
    ],
  );

  const performSiteAction = useCallback(
    async (action: SiteWorkspaceAction): Promise<SiteWorkspaceActionResult> => {
      const capability = workspaces.find(
        (workspace) => workspace.rendererName === "SiteWorkspace",
      );
      if (!capability) throw new Error("Site builder is unavailable");

      const result = await siteWorkspaceActionMutation.mutateAsync({
        workspaceId: capability.id,
        action,
      });
      await invalidateAfterWorkspaceAction(queryClient, capability.id);
      return result;
    },
    [queryClient, siteWorkspaceActionMutation, workspaces],
  );

  const performDirectorySyncAction =
    useCallback(async (): Promise<DirectorySyncWorkspaceActionResult> => {
      const capability = workspaces.find(
        (workspace) => workspace.rendererName === "DirectorySyncWorkspace",
      );
      if (!capability) throw new Error("Directory sync is unavailable");

      const result = await directorySyncWorkspaceActionMutation.mutateAsync({
        workspaceId: capability.id,
        action: { type: "sync-now" },
      });
      await Promise.all([
        invalidateAfterWorkspaceAction(queryClient, capability.id),
        queryClient.invalidateQueries({ queryKey: cmsKeys.syncStatus() }),
      ]);
      return result;
    }, [directorySyncWorkspaceActionMutation, queryClient, workspaces]);

  const visibleLoadError =
    loadError ??
    (navigationQuery.error ? errorMessage(navigationQuery.error) : null);

  if (visibleLoadError) {
    return <CmsAppStatus message={visibleLoadError} error />;
  }
  if (
    !types ||
    (activeWorkspaceId
      ? !workspaceData && !workspaceError
      : entityType && (!schema || !entities))
  ) {
    return <CmsAppStatus message="Loading…" />;
  }
  if (!activeWorkspaceId && (!entityType || !schema)) {
    return <CmsAppStatus message="No editable entity types are registered." />;
  }

  return (
    <CmsAppView
      activeWorkspaceId={activeWorkspaceId}
      types={types}
      workspaces={workspaces}
      workspaceError={workspaceError}
      publicationWorkspaceData={publicationWorkspaceData}
      siteWorkspaceData={siteWorkspaceData}
      directorySyncWorkspaceData={directorySyncWorkspaceData}
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
      performPublishingAction={performPublishingAction}
      performSiteAction={performSiteAction}
      performDirectorySyncAction={performDirectorySyncAction}
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
