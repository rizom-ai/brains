import type {
  RuntimeOperatorLaunchIntent,
  EntityIdPath,
} from "@brains/plugins";
import { useCallback } from "react";
import {
  studioCollectionPath,
  studioCreatePath,
  studioEntityPath,
  studioWorkspacePath,
} from "../../src/studio-paths";
import { createStudioCreatePrefillState } from "../../src/create-prefill-contract";
import type { StudioCollectionQuery } from "../../src/collection-query";
import { STUDIO_ACCOUNT_WORKSPACE_ID } from "../../src/account-workspace";
import {
  STUDIO_CHAT_WORKSPACE_ID,
  STUDIO_CHAT_WORKSPACE_RENDERER,
  studioChatWorkspacePath,
} from "../../src/chat-workspace";
import { type FieldAssistState } from "./entity-fields";
import { type SaveState } from "./editor-workflow";
import { createStudioChatHandoffState } from "./operator-launch";
import { type StudioWorkspaceQuery } from "./queries";
import {
  replaceWorkspaceUrlQuery,
  workspaceUrlHref,
  workspaceUrlSearch,
} from "./workspace-url-query";

import { collectionSearch } from "./collection-url-query";

import type { WorkspaceQueryState } from "./use-studio-data";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { RouterHistory } from "@tanstack/react-router";
import type {
  StudioTypeCapabilities,
  StudioWorkspaceInfo,
  TypeSchema,
} from "./api";

export interface PendingOpenState {
  pathname: string;
  save: SaveState;
}

export interface StudioNavigationActionsInput {
  history: RouterHistory;
  studioBasePath: string;
  routeSearch: string;
  entityType: string | null;
  entityCollectionQuery: StudioCollectionQuery;
  workspaces: StudioWorkspaceInfo[];
  schema: TypeSchema | null;
  activeCapabilities: StudioTypeCapabilities | undefined;
  /** The opener consumes this when the pushed route mounts its document. */
  pendingOpenState: RefObject<PendingOpenState | null>;
  setFieldAssistState: Dispatch<SetStateAction<FieldAssistState>>;
  setWorkspaceQueries: Dispatch<
    SetStateAction<Record<string, WorkspaceQueryState>>
  >;
}

export interface StudioNavigationActions {
  openWorkspaceEntity: (entityType: string, id: string) => void;
  captureInboxAsNote: (
    title: string,
    summary: string | undefined,
    entityType: string,
    entityId: string,
  ) => void;
  discussInboxInChat: (sourceId: string, itemId: string, label: string) => void;
  openWorkspaceLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  selectEntityType: (entityType: string) => void;
  changeEntityPage: (offset: number) => void;
  selectWorkspace: (workspaceId: string) => void;
  selectFolder: (prefix: EntityIdPath | null) => void;
  startCreate: () => void;
  backToList: () => void;
  changeWorkspaceQuery: (
    workspaceId: string,
    query: StudioWorkspaceQuery,
    canonicalUrlQuery?: StudioWorkspaceQuery,
  ) => void;
}

/** Every Studio action that moves the router; none of them touch the editor. */
export function useStudioNavigationActions(
  input: StudioNavigationActionsInput,
): StudioNavigationActions {
  const {
    history,
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
  } = input;
  const openWorkspaceEntity = useCallback(
    (nextEntityType: string, id: string): void => {
      const pathname = studioEntityPath(studioBasePath, nextEntityType, id);
      pendingOpenState.current = { pathname, save: { kind: "idle" } };
      history.push(pathname, {
        studioCollectionPath: studioCollectionPath(
          studioBasePath,
          nextEntityType,
        ),
      });
    },
    [studioBasePath, history],
  );

  const captureInboxAsNote = useCallback(
    (
      title: string,
      summary: string | undefined,
      entityType: string,
      entityId: string,
    ): void => {
      history.push(
        studioCreatePath(studioBasePath, "note"),
        createStudioCreatePrefillState(
          title,
          `entity://${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
          summary,
        ),
      );
    },
    [studioBasePath, history],
  );

  const discussInboxInChat = useCallback(
    (sourceId: string, itemId: string, label: string): void => {
      if (
        workspaces.some(
          (workspace) =>
            workspace.rendererName === STUDIO_CHAT_WORKSPACE_RENDERER,
        )
      ) {
        history.push(
          studioChatWorkspacePath(studioBasePath),
          createStudioChatHandoffState(sourceId, itemId, label),
        );
        return;
      }
    },
    [history, studioBasePath, workspaces],
  );

  const openWorkspaceLaunch = useCallback(
    (launch: RuntimeOperatorLaunchIntent): void => {
      switch (launch.target) {
        case "account-settings": {
          history.push(
            studioWorkspacePath(studioBasePath, STUDIO_ACCOUNT_WORKSPACE_ID),
          );
          return;
        }
        case "invitations":
          history.push(
            workspaceUrlHref(
              studioWorkspacePath(studioBasePath, "admin:administration"),
              { tab: "invitations" },
            ),
          );
          return;
        case "admin-peer-invite": {
          history.push(
            workspaceUrlHref(
              studioWorkspacePath(studioBasePath, "admin:administration"),
              {
                tab: "invitations",
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
          history.push(
            workspaceUrlHref(
              studioWorkspacePath(studioBasePath, "unified-inbox:inbox"),
              query,
            ),
          );
          return;
        }
        case "publishing":
          history.push(
            studioWorkspacePath(studioBasePath, "content-pipeline:publishing"),
          );
          return;
        case "site":
          history.push(
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
      history,
    ],
  );

  const selectEntityType = useCallback(
    (nextEntityType: string): void => {
      history.push(studioCollectionPath(studioBasePath, nextEntityType));
      // A long rail can put its last groups below the document fold. Treat a
      // rail selection like page navigation instead of retaining that offset
      // and making the destination appear blank or partially missing.
      window.scrollTo({ top: 0, left: 0 });
    },
    [studioBasePath, history],
  );

  const changeEntityPage = useCallback(
    (offset: number): void => {
      if (!entityType) return;
      history.push(
        `${studioCollectionPath(studioBasePath, entityType)}${collectionSearch({ ...entityCollectionQuery, offset })}`,
      );
      window.scrollTo({ top: 0, left: 0 });
    },
    [entityType, entityCollectionQuery, studioBasePath, history],
  );

  const selectWorkspace = useCallback(
    (workspaceId: string): void => {
      history.push(
        workspaceId === STUDIO_CHAT_WORKSPACE_ID
          ? studioChatWorkspacePath(studioBasePath)
          : studioWorkspacePath(studioBasePath, workspaceId),
      );
      window.scrollTo({ top: 0, left: 0 });
    },
    [studioBasePath, history],
  );

  const selectFolder = useCallback(
    (prefix: EntityIdPath | null): void => {
      if (!entityType) return;
      history.push(
        `${studioCollectionPath(studioBasePath, entityType)}${collectionSearch({ ...entityCollectionQuery, prefix, offset: 0 })}`,
      );
      window.scrollTo({ top: 0, left: 0 });
    },
    [entityType, studioBasePath, entityCollectionQuery, history],
  );

  const startCreate = useCallback((): void => {
    if (!schema || !entityType || activeCapabilities?.canCreate !== true)
      return;
    const params = new URLSearchParams(collectionSearch(entityCollectionQuery));
    params.set("mode", "create");
    history.push(
      `${studioCollectionPath(studioBasePath, entityType)}?${params.toString()}`,
      {
        studioCollectionPath: `${studioCollectionPath(studioBasePath, entityType)}${collectionSearch(entityCollectionQuery)}`,
      },
    );
    setFieldAssistState({ kind: "idle" });
  }, [
    activeCapabilities,
    schema,
    entityType,
    entityCollectionQuery,
    studioBasePath,
    history,
  ]);

  const backToList = useCallback((): void => {
    if (!entityType) return;
    const collectionPath = `${studioCollectionPath(studioBasePath, entityType)}${collectionSearch(entityCollectionQuery)}`;
    const historyState: unknown = history.location.state;
    if (
      typeof historyState === "object" &&
      historyState !== null &&
      "studioCollectionPath" in historyState &&
      historyState.studioCollectionPath === collectionPath &&
      history.canGoBack()
    ) {
      history.back();
      return;
    }
    history.replace(collectionPath);
  }, [studioBasePath, entityType, entityCollectionQuery, history]);
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
          history,
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
    [studioBasePath, routeSearch, history, workspaces],
  );
  return {
    openWorkspaceEntity,
    captureInboxAsNote,
    discussInboxInChat,
    openWorkspaceLaunch,
    selectEntityType,
    changeEntityPage,
    selectWorkspace,
    selectFolder,
    startCreate,
    backToList,
    changeWorkspaceQuery,
  };
}
