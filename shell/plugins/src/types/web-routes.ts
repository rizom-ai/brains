export const WebRouteMethods = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "OPTIONS",
] as const;
export type WebRouteMethod = (typeof WebRouteMethods)[number];

export type WebRouteHandler = (
  request: Request,
) => Response | Promise<Response>;

export type WebRouteMatch = "exact" | "prefix";

export interface WebRouteDefinition {
  /** Absolute mounted path (e.g. "/cms" or "/cms-config") */
  path: string;
  /** Match only `path` (default) or descendants on a segment boundary. */
  match?: WebRouteMatch;
  /** HTTP method */
  method?: WebRouteMethod;
  /** Allow unauthenticated access */
  public?: boolean;
  /** Request handler */
  handler: WebRouteHandler;
}

export interface RegisteredWebRoute {
  /** The plugin that registered this route */
  pluginId: string;
  /** The mounted path */
  fullPath: string;
  /** The original route definition */
  definition: WebRouteDefinition;
}
