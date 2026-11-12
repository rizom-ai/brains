import type { ApiRouteDefinition } from "./api-routes";
import type {
  WebRouteHandler,
  WebRouteMatch,
  WebRouteMethod,
} from "./web-routes";

export type SharedHostAdmission = "admit" | "deny";

interface RegisteredHttpRouteBase {
  ownerPluginId: string;
  fullPath: string;
  method: WebRouteMethod;
  match: WebRouteMatch;
  sharedHostAdmission: SharedHostAdmission;
}

export interface RegisteredHandlerHttpRoute extends RegisteredHttpRouteBase {
  kind: "handler";
  /** Explicit preview reachability, independent of shared-host admission. */
  preview?: boolean;
  /** A `claim` route's say over a request path; never claims a reserved one. */
  claims?: (path: string) => boolean;
  handler: WebRouteHandler;
}

export interface RegisteredToolHttpRoute extends RegisteredHttpRouteBase {
  kind: "tool";
  match: "exact";
  definition: ApiRouteDefinition;
}

export type RegisteredHttpRoute =
  RegisteredHandlerHttpRoute | RegisteredToolHttpRoute;

export interface HttpRouteManifestEntry {
  ownerPluginId: string;
  kind: RegisteredHttpRoute["kind"];
  method: WebRouteMethod;
  fullPath: string;
  match: WebRouteMatch;
  sharedHostAdmission: SharedHostAdmission;
}

/**
 * The handler route a request reaches: the route declared for exactly its
 * path, else the longest prefix route that contains the path by segment,
 * else a claim route that claims the path.
 * The web server and the test brain both serve through this.
 */
export function findHandlerRoute(
  routes: readonly RegisteredHttpRoute[],
  method: string,
  path: string,
): RegisteredHandlerHttpRoute | undefined {
  const handlerRoutes = routes.filter(
    (route): route is RegisteredHandlerHttpRoute =>
      route.kind === "handler" && route.method === method,
  );
  return (
    handlerRoutes.find(
      (route) => route.match === "exact" && route.fullPath === path,
    ) ??
    handlerRoutes
      .filter(
        (route) =>
          route.match === "prefix" &&
          (path === route.fullPath ||
            path.startsWith(`${route.fullPath.replace(/\/$/, "")}/`)),
      )
      .sort((left, right) => right.fullPath.length - left.fullPath.length)[0] ??
    handlerRoutes.find(
      (route) => route.match === "claim" && route.claims?.(path),
    )
  );
}
