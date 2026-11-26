import type { WebRouteDefinition } from "@brains/sdk/internal/interface-runtime";
import type { MatrixFetch } from "./bot-account";

/** Paths the homeserver answers, all of them forwarded to it. */
export const HOMESERVER_PATH_PREFIXES: readonly string[] = [
  "/_matrix",
  // Tuwunel's own pages for the sign-in flow and their stylesheet.
  "/_tuwunel",
];

const FORWARDED_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "OPTIONS",
] as const;

/** Headers that describe one hop, not the request, so they are not passed on. */
const HOP_HEADERS = new Set([
  "connection",
  "host",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
  "content-length",
]);

export interface ForwardOptions {
  homeserverUrl: string;
  fetch?: MatrixFetch;
  /** Told why a request could not reach the homeserver. */
  onUnreachable?: (error: unknown, path: string) => void;
}

/**
 * Pass a request to the homeserver and its answer back, streamed both ways:
 * `/sync` holds a request open and media can be large. Redirects go back to
 * the client unfollowed, since the sign-in flow is a chain of them.
 */
export async function forwardToHomeserver(
  request: Request,
  options: ForwardOptions,
): Promise<Response> {
  const incoming = new URL(request.url);
  const target = `${options.homeserverUrl.replace(/\/+$/, "")}${incoming.pathname}${incoming.search}`;
  const headers = new Headers(
    [...request.headers].filter(([name]) => !HOP_HEADERS.has(name)),
  );
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", incoming.protocol.replace(/:$/, ""));
  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  try {
    const response = await (options.fetch ?? fetch)(
      new Request(target, {
        method: request.method,
        headers,
        redirect: "manual",
        ...(hasBody ? { body: request.body, duplex: "half" } : {}),
      }),
    );
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(
        [...response.headers].filter(([name]) => !HOP_HEADERS.has(name)),
      ),
    });
  } catch (error) {
    options.onUnreachable?.(error, incoming.pathname);
    // An unreachable homeserver is a gateway failure, in Matrix's error shape.
    return Response.json(
      { errcode: "M_UNKNOWN", error: "The homeserver is not reachable" },
      { status: 502 },
    );
  }
}

/** The forwarding routes: every method under each homeserver prefix. */
export function forwardingRoutes(
  options: ForwardOptions,
): WebRouteDefinition[] {
  return HOMESERVER_PATH_PREFIXES.flatMap((path) =>
    FORWARDED_METHODS.map((method): WebRouteDefinition => ({
      path,
      method,
      match: "prefix",
      public: true,
      handler: (request: Request): Promise<Response> =>
        forwardToHomeserver(request, options),
    })),
  );
}

export interface DiscoveryOptions {
  serverName: string;
  publicBaseUrl: string;
}

/**
 * The well-known documents that send federation and clients to the brain's
 * own origin, where the forwarding routes take over. Clients fetch them from
 * other origins, so they are served to any.
 */
export function wellKnownRoutes(
  options: DiscoveryOptions,
): WebRouteDefinition[] {
  const json = (body: unknown): Response =>
    Response.json(body, { headers: { "access-control-allow-origin": "*" } });
  return [
    {
      path: "/.well-known/matrix/server",
      method: "GET",
      public: true,
      handler: (): Response =>
        json({ "m.server": `${options.serverName}:443` }),
    },
    {
      path: "/.well-known/matrix/client",
      method: "GET",
      public: true,
      handler: (): Response =>
        json({
          "m.homeserver": {
            base_url: options.publicBaseUrl.replace(/\/+$/, ""),
          },
        }),
    },
  ];
}
