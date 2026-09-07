import { useEffect } from "react";
import { studioWorkspacePath } from "../../src/studio-paths";
import type { StudioCollectionQuery } from "../../src/collection-query";
import {
  resolveStudioHomePath,
  resolveStudioWorkspaceAlias,
} from "./studio-router";
import { studioKeys } from "./queries";
import {
  replaceWorkspaceUrlQuery,
  workspaceUrlHref,
} from "./workspace-url-query";

import { collectionSearch } from "./collection-url-query";

import type { Dispatch, SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { RouterHistory } from "@tanstack/react-router";
import type { RuntimeStudioWorkspaceData } from "@brains/plugins";
import type { StudioPathTarget } from "../../src/studio-paths";
import type { EntityTypeInfo, StudioWorkspaceInfo } from "./api";
import type { StudioWorkspaceQuery } from "./queries";

export interface StudioRouteEffectsInput {
  history: RouterHistory;
  queryClient: QueryClient;
  studioBasePath: string;
  routeTarget: StudioPathTarget;
  routePathname: string;
  routeSearch: string;
  entityType: string | null;
  activeWorkspaceId: string | null;
  types: EntityTypeInfo[] | null;
  workspaces: StudioWorkspaceInfo[];
  activeType: EntityTypeInfo | undefined;
  activeWorkspace: StudioWorkspaceInfo | undefined;
  entityCollectionQuery: StudioCollectionQuery;
  entityListOffset: number;
  entityListTotal: number | undefined;
  declarativeWorkspaceData: RuntimeStudioWorkspaceData | null;
  initialUrlWorkspaceQuery: StudioWorkspaceQuery;
  setActiveWorkspaceId: Dispatch<SetStateAction<string | null>>;
  setEntityType: Dispatch<SetStateAction<string | null>>;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  /** Drop any in-flight open when the route turns out to be unreachable. */
  supersedeOpen: () => void;
}

/**
 * The route's consequences: resolve it to an active workspace or entity type,
 * clamp a page offset past the end of a collection, keep a workspace's URL
 * query canonical, and refresh a declarative workspace on its own cadence.
 */
export function useStudioRouteEffects(input: StudioRouteEffectsInput): void {
  const {
    history,
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
  } = input;

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
      history.replace(
        `${routePathname}${collectionSearch({ ...entityCollectionQuery, offset: lastOffset })}`,
        history.location.state,
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
    history,
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
        history,
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
    history,
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
          history.replace(aliasHref);
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
        history.replace(homePath);
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
  }, [routeSearch, routeTarget, history, studioBasePath, types, workspaces]);
}
