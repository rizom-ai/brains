import {
  createRootRoute,
  createRoute,
  createRouter,
  type AnyRoute,
  type AnyRouter,
  type RouteComponent,
  type RouterHistory,
} from "@tanstack/react-router";
import { normalizeCmsBasePath } from "../../src/cms-paths";

let cmsRouterBasePath = "/cms";

export function getCmsRouterBasePath(): string {
  return cmsRouterBasePath;
}

/** Create the package-local browser router beneath the configured CMS mount. */
export function createCmsRouter(
  basePath: string,
  component?: RouteComponent,
  history?: RouterHistory,
): AnyRouter {
  cmsRouterBasePath = normalizeCmsBasePath(basePath) || "/";

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
    basepath: cmsRouterBasePath,
    ...(history ? { history } : {}),
  });
}

export type CmsRouter = AnyRouter;

declare module "@tanstack/react-router" {
  interface Register {
    router: CmsRouter;
  }
}
