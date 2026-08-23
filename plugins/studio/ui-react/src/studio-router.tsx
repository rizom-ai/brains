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
import { normalizeStudioBasePath } from "../../src/studio-paths";

let studioRouterBasePath = "/studio";

export function getStudioRouterBasePath(): string {
  return studioRouterBasePath;
}

/** Create the package-local browser router beneath the configured Studio mount. */
export function createStudioRouter(
  basePath: string,
  component?: RouteComponent,
  history?: RouterHistory,
): AnyRouter {
  studioRouterBasePath = normalizeStudioBasePath(basePath) || "/";

  const rootRoute = createRootRoute({
    ...(component ? { component, notFoundComponent: component } : {}),
  });
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
  const routeTree = rootRoute.addChildren([
    indexRoute,
    collectionRoute,
    entityRoute,
    workspaceRoute,
  ]) as AnyRoute;

  return createRouter({
    routeTree,
    basepath: studioRouterBasePath,
    ...(history ? { history } : {}),
  });
}

export type StudioRouter = AnyRouter;

declare module "@tanstack/react-router" {
  interface Register {
    router: StudioRouter;
  }
}
