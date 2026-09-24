import { useCallback, useEffect, useRef, useState } from "react";
import { studioCollectionPath } from "../../src/studio-paths";
import { GROUPING_VOCABULARY_TYPE } from "../../src/grouping-vocabulary-contract";
import type { StudioCollectionQuery } from "../../src/collection-query";
import { type MobileEditorPane } from "./app-view";
import { ApiError, type FieldAssistResponse } from "./api";
import {
  visibleFieldValues,
  type FieldAssistState,
  type FieldAssistVariant,
} from "./entity-fields";
import { derivePipeline } from "./editor-status";
import { studioKeys } from "./queries";
import { errorMessage } from "./ui-utils";

import { collectionSearch } from "./collection-url-query";

import type { Dispatch, SetStateAction } from "react";
import type { QueryClient, UseMutationResult } from "@tanstack/react-query";
import type { RouterHistory } from "@tanstack/react-router";
import type { EntityIdPath } from "@brains/plugins";
import type {
  StudioApi,
  StudioTypeCapabilities,
  SyncStatus,
  TypeSchema,
} from "./api";
import type {
  DeleteEntityInput,
  SaveEntityInput,
  SaveEntityResult,
} from "./mutations";
import type {
  EditorWorkflowAction,
  EditorWorkflowState,
  SaveState,
} from "./editor-workflow";

export interface EditorActionsInput {
  api: StudioApi;
  queryClient: QueryClient;
  history: RouterHistory;
  studioBasePath: string;
  entityType: string | null;
  entityCollectionQuery: StudioCollectionQuery;
  groupReturnPath: string | undefined;
  activeCapabilities: StudioTypeCapabilities | undefined;
  schema: TypeSchema | null;
  editor: EditorWorkflowState;
  dispatchEditor: Dispatch<EditorWorkflowAction>;
  createPath: EntityIdPath | null;
  syncStatus: SyncStatus | null;
  deleting: boolean;
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
  /** Re-open the saved entity so the next edit carries a fresh content hash. */
  openEntity: (id: string, nextState?: SaveState) => void;
  /** The opener's current request id; a save result for an older id is dropped. */
  currentOpenRequest: () => number;
  setMobilePane: Dispatch<SetStateAction<MobileEditorPane>>;
  setFieldAssistState: Dispatch<SetStateAction<FieldAssistState>>;
}

export interface EditorActions {
  runFieldAssist: (variant: FieldAssistVariant, field: string) => void;
  applyFieldAssist: (field: string, suggestion: string | string[]) => void;
  save: () => void;
  remove: () => void;
  /** The git commit the pipeline strip measures a save against. */
  baselineCommit: string | null;
}

/** The actions that write the open document, and the polling that follows a save. */
export function useEditorActions(input: EditorActionsInput): EditorActions {
  const {
    api,
    queryClient,
    history,
    studioBasePath,
    entityType,
    entityCollectionQuery,
    groupReturnPath,
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
  } = input;
  const { mode, draft, body, save: saveState } = editor;
  const [baselineCommit, setBaselineCommit] = useState<string | null>(null);
  const saveStartedAt = useRef(0);

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
      api
        .requestFieldAssist({
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
            ...(createPath && { idPath: createPath }),
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
    const requestId = currentOpenRequest();
    saveEntityMutation.mutate(input, {
      onSuccess: async (result) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["studio", "groupings"] }),
          queryClient.invalidateQueries({
            queryKey: studioKeys.entities(entityType),
          }),
          queryClient.invalidateQueries({
            queryKey: studioKeys.syncStatus(),
          }),
          ...(mode.kind === "create" || entityType === GROUPING_VOCABULARY_TYPE
            ? [
                queryClient.invalidateQueries({
                  queryKey: studioKeys.navigation(),
                }),
              ]
            : []),
        ]);
        if (requestId !== currentOpenRequest()) return;
        const noop = "skipped" in result && result.skipped === true;
        // Re-fetch after every save so the next edit carries a fresh
        // contentHash precondition.
        openEntity(result.entityId, { kind: "saved", noop });
      },
      onError: (error: Error) => {
        if (requestId !== currentOpenRequest()) return;
        if (error instanceof ApiError && error.issues.length > 0)
          setMobilePane("details");
        dispatchEditor({
          type: "saveFailed",
          save:
            error instanceof ApiError &&
            error.status === 409 &&
            mode.kind === "edit"
              ? { kind: "conflict", message: errorMessage(error) }
              : {
                  kind: "error",
                  message:
                    error instanceof ApiError && error.issues.length > 0
                      ? error.message || "Validation failed"
                      : errorMessage(error),
                  ...(error instanceof ApiError
                    ? { issues: error.issues }
                    : {}),
                },
        });
      },
    });
  }, [
    activeCapabilities,
    entityType,
    mode,
    createPath,
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
              queryKey: ["studio", "groupings"],
            }),
            queryClient.invalidateQueries({
              queryKey: studioKeys.entities(entityType),
            }),
            queryClient.invalidateQueries({
              queryKey: studioKeys.syncStatus(),
            }),
            queryClient.invalidateQueries({
              queryKey: studioKeys.navigation(),
            }),
          ]);
          history.replace(
            groupReturnPath ??
              `${studioCollectionPath(studioBasePath, entityType)}${collectionSearch(entityCollectionQuery)}`,
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
    history,
    groupReturnPath,
    entityCollectionQuery,
  ]);

  return { runFieldAssist, applyFieldAssist, save, remove, baselineCommit };
}
