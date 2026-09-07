import { isPlainRecord } from "@brains/utils/predicates";
import { useCallback, useEffect, useRef, useState } from "react";
import { studioCollectionPath, studioEntityPath } from "../../src/studio-paths";
import type { StudioCollectionQuery } from "../../src/collection-query";
import { type MobileEditorPane, mobileEditorEntry } from "./app-view";
import type { BodyMode } from "./body-editor";
import { createEditorDocument } from "./editor-document";
import {
  consumeStudioCreatePrefill,
  createPrefilledDraft,
  withoutStudioCreatePrefill,
} from "./create-prefill";
import type { FieldAssistState } from "./entity-fields";
import type { EditorWorkflowAction, SaveState } from "./editor-workflow";
import {
  entityDetailQueryOptions,
  entityListQueryOptions,
  entitySchemaQueryOptions,
} from "./queries";
import { emptyDraft } from "./ui-utils";
import { readErrorMessage } from "./read-error";

import { collectionQuery, collectionSearch } from "./collection-url-query";

import type { Dispatch, RefObject, SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { RouterHistory } from "@tanstack/react-router";
import type { StudioPathTarget } from "../../src/studio-paths";
import type { StudioApi, StudioTypeCapabilities } from "./api";
import type { PendingOpenState } from "./use-studio-navigation-actions";

export interface EntityOpenerInput {
  api: StudioApi;
  queryClient: QueryClient;
  history: RouterHistory;
  studioBasePath: string;
  routeTarget: StudioPathTarget;
  routePathname: string;
  routeSearch: string;
  currentStudioPathname: string;
  createMode: boolean;
  entityType: string | null;
  activeCapabilities: StudioTypeCapabilities | undefined;
  entityCollectionQuery: StudioCollectionQuery;
  preferredMobilePane: RefObject<MobileEditorPane | null>;
  dispatchEditor: Dispatch<EditorWorkflowAction>;
  setMobilePane: Dispatch<SetStateAction<MobileEditorPane>>;
  setBodyMode: Dispatch<SetStateAction<BodyMode>>;
  setFieldAssistState: Dispatch<SetStateAction<FieldAssistState>>;
}

export interface EntityOpener {
  /** Open an entity: navigate when the route differs, else load it in place. */
  openEntity: (id: string, nextState?: SaveState) => void;
  /** The last open's error, if it failed; route resolution reports here too. */
  loadError: string | null;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  /** Re-run the current open (a retry after a failed load). */
  retryOpen: () => void;
  /** Invalidate every in-flight open so its result is dropped on arrival. */
  supersedeOpen: () => void;
  /** The id of the latest open; a caller compares it later to detect supersession. */
  currentOpenRequest: () => number;
  /** Set by navigation before pushing an entity route; consumed when that route opens. */
  pendingOpenState: RefObject<PendingOpenState | null>;
}

/** `History.state` is typed `any`; narrow it before handing it to callers. */
function historyStateRecord(): Record<string, unknown> {
  const state: unknown = window.history.state;
  return isPlainRecord(state) ? state : {};
}

/**
 * Owns the document-opening lifecycle: the route-driven open effect, the
 * in-place open, and the request ids that make a superseded load inert. The
 * ids stay a ref because async continuations must read the latest id
 * synchronously; the hook's tests pin that a stale fetch never dispatches.
 */
export function useEntityOpener(input: EntityOpenerInput): EntityOpener {
  const {
    api,
    queryClient,
    history,
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
  } = input;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const pendingOpenState = useRef<PendingOpenState | null>(null);
  const openRequestId = useRef(0);
  const selectedEntityTypeRef = useRef(entityType);
  selectedEntityTypeRef.current = entityType;

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
    const isCurrentRequest = (): boolean =>
      active && requestId === openRequestId.current;
    queryClient
      .fetchQuery({
        ...entitySchemaQueryOptions(api, entityType),
        staleTime: 0,
      })
      .then(async (loadedSchema) => {
        if (!active || requestId !== openRequestId.current) return undefined;
        const nextPane = mobileEditorEntry(
          loadedSchema,
          preferredMobilePane.current,
        );
        setMobilePane(nextPane);
        if (
          window.matchMedia("(max-width: 640px)").matches &&
          nextPane !== "details"
        ) {
          setBodyMode(nextPane === "write" ? "source" : "preview");
        }
        if (createMode && routeEntityId === null) {
          const canCreateRequestedType = activeCapabilities?.canCreate === true;
          if (!canCreateRequestedType) {
            setLoadError(`Creating ${entityType} is not allowed.`);
            return undefined;
          }
          const prefill = consumeStudioCreatePrefill(
            window.history.state,
            entityType,
            () =>
              window.history.replaceState(
                withoutStudioCreatePrefill(historyStateRecord()),
                "",
                window.location.href,
              ),
          );
          const next = createPrefilledDraft(loadedSchema.fields, prefill);
          dispatchEditor({
            type: "creationStarted",
            draft: next.draft,
            body: next.body,
            ...(!prefill && {
              prefix:
                entityType === "note"
                  ? null
                  : collectionQuery(routeSearch).prefix,
            }),
          });
          return undefined;
        }
        if (routeEntityId !== null) {
          return queryClient
            .fetchQuery({
              ...entityDetailQueryOptions(api, entityType, routeEntityId),
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
          const loadedPage = await queryClient.ensureQueryData(
            entityListQueryOptions(
              api,
              entityType,
              collectionQuery("?scope=collection"),
            ),
          );
          if (!isCurrentRequest()) return undefined;
          const record = loadedPage.entities[0];
          if (record) {
            return queryClient
              .fetchQuery({
                ...entityDetailQueryOptions(api, entityType, record.id),
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
          setLoadError(readErrorMessage(error));
        }
      });
    return (): void => {
      active = false;
    };
  }, [
    createMode,
    currentStudioPathname,
    entityType,
    loadAttempt,
    queryClient,
    routePathname,
    routeSearch,
    routeTarget,
    activeCapabilities?.canCreate,
  ]);

  const openEntity = useCallback(
    (id: string, nextState: SaveState = { kind: "idle" }): void => {
      if (!entityType) return;
      const pathname = studioEntityPath(studioBasePath, entityType, id);
      if (pathname !== currentStudioPathname) {
        pendingOpenState.current = { pathname, save: nextState };
        const collectionPath = `${studioCollectionPath(studioBasePath, entityType)}${collectionSearch(entityCollectionQuery)}`;
        const replaceCreation = createMode && nextState.kind === "saved";
        const historyState: unknown = history.location.state;
        const fromCollection =
          !replaceCreation ||
          (isPlainRecord(historyState) &&
            historyState["studioCollectionPath"] === collectionPath);
        history[replaceCreation ? "replace" : "push"](
          `${pathname}${collectionSearch(entityCollectionQuery)}`,
          fromCollection ? { studioCollectionPath: collectionPath } : undefined,
          nextState.kind === "saved" ? { ignoreBlocker: true } : undefined,
        );
        return;
      }
      const requestId = ++openRequestId.current;
      const requestedType = entityType;
      queryClient
        .fetchQuery({
          ...entityDetailQueryOptions(api, entityType, id),
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
            setLoadError(readErrorMessage(error));
          }
        });
    },
    [
      studioBasePath,
      currentStudioPathname,
      createMode,
      entityType,
      entityCollectionQuery,
      queryClient,
      history,
    ],
  );

  const retryOpen = useCallback((): void => {
    setLoadAttempt((attempt) => attempt + 1);
  }, []);
  const supersedeOpen = useCallback((): void => {
    openRequestId.current += 1;
  }, []);
  const currentOpenRequest = useCallback(
    (): number => openRequestId.current,
    [],
  );

  return {
    openEntity,
    loadError,
    setLoadError,
    retryOpen,
    supersedeOpen,
    currentOpenRequest,
    pendingOpenState,
  };
}
