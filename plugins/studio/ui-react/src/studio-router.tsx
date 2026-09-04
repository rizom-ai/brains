/** @jsxImportSource react */
import {
  createRootRoute,
  createRoute,
  createRouter,
  type AnyRoute,
  type AnyRouter,
  type RouteComponent,
  type RouterHistory,
} from "@tanstack/react-router";
import {
  normalizeStudioBasePath,
  studioWorkspacePath,
} from "../../src/studio-paths";
import { STUDIO_ACCOUNT_WORKSPACE_ID } from "../../src/account-workspace";
import { STUDIO_CHAT_ROUTE_PATH } from "../../src/chat-workspace";
import { STUDIO_OVERVIEW_WORKSPACE_ID } from "../../src/overview-constants";

let studioRouterBasePath = "/studio";

export function getStudioRouterBasePath(): string {
  return studioRouterBasePath;
}

export function resolveStudioWorkspaceAlias(
  basePath: string,
  requestedId: string,
  rawSearch: string,
  workspaces: readonly {
    readonly id: string;
    readonly aliases?: readonly {
      readonly id: string;
      readonly query: Readonly<Record<string, string>>;
    }[];
  }[],
): string | undefined {
  for (const workspace of workspaces) {
    const alias = workspace.aliases?.find((entry) => entry.id === requestedId);
    if (!alias) continue;
    const search = new URLSearchParams(rawSearch);
    for (const [key, value] of Object.entries(alias.query)) {
      search.set(key, value);
    }
    search.sort();
    const suffix = search.toString();
    const pathname = studioWorkspacePath(basePath, workspace.id);
    return suffix ? `${pathname}?${suffix}` : pathname;
  }
  return undefined;
}

export function resolveStudioHomePath(
  basePath: string,
  types: readonly {
    readonly entityType: string;
    readonly isSingleton: boolean;
  }[],
  workspaces: readonly { readonly id: string }[],
): string {
  const normalizedBase = normalizeStudioBasePath(basePath) || "/";
  const overview = workspaces.find(
    (workspace) => workspace.id === STUDIO_OVERVIEW_WORKSPACE_ID,
  );
  if (overview) return studioWorkspacePath(normalizedBase, overview.id);
  const account = workspaces.find(
    (workspace) => workspace.id === STUDIO_ACCOUNT_WORKSPACE_ID,
  );
  if (types.length === 0 && account) {
    return studioWorkspacePath(normalizedBase, account.id);
  }
  return normalizedBase;
}

/**
 * Create the package-local browser router for Studio and its canonical Chat
 * door. The router owns full browser paths so `/chat` can render the native
 * workspace without redirecting to an encoded implementation path.
 */
export function createStudioRouter(
  basePath: string,
  component?: RouteComponent,
  history?: RouterHistory,
): AnyRouter {
  studioRouterBasePath = normalizeStudioBasePath(basePath) || "/";

  const rootRoute = createRootRoute({
    ...(component ? { component, notFoundComponent: component } : {}),
  });
  const chatRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: STUDIO_CHAT_ROUTE_PATH.slice(1),
  });

  const routeTree =
    studioRouterBasePath === "/"
      ? ((): AnyRoute => {
          const indexRoute = createRoute({
            getParentRoute: () => rootRoute,
            path: "/",
          });
          const collectionRoute = createRoute({
            getParentRoute: () => rootRoute,
            path: "entities/$entityType",
          });
          const entityRoute = createRoute({
            getParentRoute: () => rootRoute,
            path: "entities/$entityType/$",
          });
          const workspaceRoute = createRoute({
            getParentRoute: () => rootRoute,
            path: "workspaces/$workspaceId",
          });
          return rootRoute.addChildren([
            indexRoute,
            collectionRoute,
            entityRoute,
            workspaceRoute,
            chatRoute,
          ]);
        })()
      : ((): AnyRoute => {
          const studioRoute = createRoute({
            getParentRoute: () => rootRoute,
            path: studioRouterBasePath.slice(1),
          });
          const indexRoute = createRoute({
            getParentRoute: () => studioRoute,
            path: "/",
          });
          const collectionRoute = createRoute({
            getParentRoute: () => studioRoute,
            path: "entities/$entityType",
          });
          const entityRoute = createRoute({
            getParentRoute: () => studioRoute,
            path: "entities/$entityType/$",
          });
          const workspaceRoute = createRoute({
            getParentRoute: () => studioRoute,
            path: "workspaces/$workspaceId",
          });
          return rootRoute.addChildren([
            studioRoute.addChildren([
              indexRoute,
              collectionRoute,
              entityRoute,
              workspaceRoute,
            ]),
            chatRoute,
          ]);
        })();

  return createRouter({
    routeTree,
    ...(history ? { history } : {}),
  });
}

export type StudioRouter = AnyRouter;

declare module "@tanstack/react-router" {
  interface Register {
    router: StudioRouter;
  }
}
