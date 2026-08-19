import { join } from "node:path";
import type { AuthPrincipal } from "@brains/auth-service";
import { deriveConsoleSurfaces } from "@brains/plugins";
import type { ServicePluginContext, WebRouteDefinition } from "@brains/plugins";
import { renderAccountShellHtml } from "./account-shell";

const uiAssetFile = join(import.meta.dir, "..", "dist", "ui", "account-app.js");

export interface AccountRouteOptions {
  routePath: string;
  getContext: () => ServicePluginContext;
  resolvePrincipal: (request: Request) => Promise<AuthPrincipal | undefined>;
}

export function createAccountRoutes(
  options: AccountRouteOptions,
): WebRouteDefinition[] {
  const assetPath = `${options.routePath}/assets/app.js`;
  const assetHref = `${assetPath}?v=${Date.now().toString(36)}`;

  return [
    {
      path: options.routePath,
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        const principal = await options.resolvePrincipal(request);
        if (!principal) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: `/login?return_to=${encodeURIComponent(options.routePath)}`,
              "Cache-Control": "no-store",
            },
          });
        }

        const context = options.getContext();
        return new Response(
          renderAccountShellHtml({
            assetPath: assetHref,
            routePath: options.routePath,
            displayName: principal.displayName,
            role: principal.role,
            surfaces: deriveConsoleSurfaces(context.webRoutes.getRoutes(), {
              activeId: "account",
              permissionLevel: principal.permissionLevel,
              self: { id: "account", href: options.routePath },
            }),
            sessionHref: `/logout?return_to=${encodeURIComponent(options.routePath)}`,
            principal: {
              displayName: principal.displayName,
              role: principal.role,
            },
          }),
          {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
            },
          },
        );
      },
    },
    {
      path: assetPath,
      method: "GET",
      public: true,
      handler: async (): Promise<Response> => {
        const file = Bun.file(uiAssetFile);
        if (!(await file.exists())) {
          return new Response("Account console UI asset not built", {
            status: 503,
          });
        }
        return new Response(file, {
          headers: {
            "Content-Type": "text/javascript; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  ];
}
