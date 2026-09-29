export const WebRouteMethods = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "OPTIONS",
] as const;
export type WebRouteMethod = (typeof WebRouteMethods)[number];

/** Host-supplied socket metadata. Never derive this from HTTP/forwarding headers. */
export interface WebRouteTransportContext {
  readonly remoteAddress?: string;
}

export type WebRouteHandler = (
  request: Request,
  transport?: WebRouteTransportContext,
) => Response | Promise<Response>;

export type WebRouteMatch = "exact" | "prefix";

export interface WebRouteDefinition {
  /** Absolute mounted path (e.g. "/studio" or "/studio-config") */
  path: string;
  /** Match only `path` (default) or descendants on a segment boundary. */
  match?: WebRouteMatch;
  /** HTTP method */
  method?: WebRouteMethod;
  /** Allow unauthenticated access */
  public?: boolean;
  /** Also serve on the preview host. Reachability only; admission checks still apply. */
  preview?: boolean;
  /** Request handler */
  handler: WebRouteHandler;
}

/**
 * An admitted public page whose presentation belongs to the installed site.
 * The host may use its generated page at the same path; this response is the
 * fallback for apps without that site page. Denials and redirects never delegate.
 * APIs and authenticated pages use ordinary Responses, not this opt-in.
 */
export class SitePageResponse extends Response {}

export interface JsonResponseInit {
  status?: number;
  headers?: Record<string, string>;
}

/**
 * Build a JSON Response for a web route handler.
 */
export function jsonResponse(
  payload: unknown,
  init: JsonResponseInit = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

/**
 * Build a `{ error }` JSON Response with the given status.
 */
export function jsonError(
  message: string,
  status: number,
  init: Omit<JsonResponseInit, "status"> = {},
): Response {
  return jsonResponse({ error: message }, { status, ...init });
}

export interface RegisteredWebRoute {
  /** The plugin that registered this route */
  pluginId: string;
  /** The mounted path */
  fullPath: string;
  /** The original route definition */
  definition: WebRouteDefinition;
}
