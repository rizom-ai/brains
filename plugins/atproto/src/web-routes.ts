import type { WebRouteDefinition } from "@brains/plugins";
import type { AtprotoConfig } from "./config";
import {
  buildConfiguredDidWebDocuments,
  buildConventionalDidWebDocuments,
} from "./did";

/**
 * The `did:web` documents this brain serves, plus the owner's atproto handle
 * verification file. Documents are rebuilt per request because the
 * conventional ones depend on the hostname the request arrived on.
 */
export function buildAtprotoWebRoutes(
  config: AtprotoConfig,
): WebRouteDefinition[] {
  if (!config.enabled) return [];

  const configuredDocuments = buildConfiguredDidWebDocuments(config);
  const conventionalPaths = [
    ...(!config.brainDid ? ["/.well-known/did.json"] : []),
    ...(!config.anchorDid ? ["/anchor/did.json"] : []),
  ];
  const paths = [
    ...new Set([
      ...configuredDocuments.map((entry) => entry.path),
      ...conventionalPaths,
    ]),
  ];

  const routes: WebRouteDefinition[] = paths.map((path) => ({
    path,
    method: "GET",
    public: true,
    handler: (request: Request): Response => {
      const hostname = new URL(request.url).hostname;
      const candidates = [
        ...buildConfiguredDidWebDocuments(config),
        ...buildConventionalDidWebDocuments(config, hostname),
      ].filter((entry) => entry.path === path);
      const match =
        candidates.find((entry) => entry.hostname === hostname) ??
        candidates[0];
      if (!match) return new Response("Not found", { status: 404 });
      return new Response(JSON.stringify(match.document), {
        headers: { "Content-Type": "application/did+json" },
      });
    },
  }));

  // Member handles under the fleet domain: when the owner's account DID
  // is configured, serve it as plain text so the owner's atproto handle
  // verifies against this domain (the HTTP method — no DNS records).
  const accountDid = config.accountDid;
  if (accountDid) {
    routes.push({
      path: "/.well-known/atproto-did",
      method: "GET",
      public: true,
      handler: (): Response =>
        new Response(accountDid, {
          headers: { "Content-Type": "text/plain" },
        }),
    });
  }

  return routes;
}
