import { toSdkError } from "@brains/contracts";
import { z } from "@brains/utils/zod";

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

const sitePageResponseBrand = Symbol.for("@rizom/brain/site-page-response/v1");

/** The element in a generated site page that a route fills: `<div data-site-slot="name"></div>`. */
export const SITE_SLOT_ATTRIBUTE = "data-site-slot";

/** Trusted route markup, not untrusted text. The name is a 1–100 character identifier. */
export interface SitePageSlot {
  readonly name: string;
  readonly html: string;
}

const sitePageSlotSchema = z.strictObject({
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9:_-]{0,99}$/),
  html: z.string(),
});

/**
 * An admitted public page whose presentation belongs to the installed site.
 * The host may use its generated page at the same path; this response is the
 * fallback for apps without that site page. Without a slot, only successful
 * public GET pages delegate. APIs/authenticated pages use ordinary Responses.
 *
 * With a slot, the route renders per request inside the site's page, including
 * POST results and error pages. Status and request-owned headers are preserved;
 * missing pages/slots use the fallback. This presentation opt-in grants no
 * admission or read/write authority. Scripts must be governed by the route's CSP.
 */
export class SitePageResponse extends Response {
  declare readonly slot: SitePageSlot | undefined;

  constructor(
    body?: BodyInit | null,
    init: ResponseInit & { slot?: SitePageSlot } = {},
  ) {
    const { slot, ...responseInit } = init;
    super(body, responseInit);
    const parsed =
      slot === undefined ? undefined : sitePageSlotSchema.safeParse(slot);
    if (parsed && !parsed.success)
      throw toSdkError(parsed.error, "invalid_input");
    Object.defineProperty(this, "slot", {
      value: parsed?.success ? Object.freeze(parsed.data) : undefined,
      enumerable: true,
    });
    Object.defineProperty(this, sitePageResponseBrand, { value: true });
  }

  /** Constructor identity is not shared by independently bundled SDK consumers. */
  static is(value: unknown): value is SitePageResponse {
    return (
      value instanceof Response &&
      Reflect.get(value, sitePageResponseBrand) === true
    );
  }
}

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
