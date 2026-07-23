import { join } from "node:path";
import type { AuthAdminPrincipal } from "@brains/auth-service/admin-contracts";
import { deriveConsoleSurfaces } from "@brains/console-theme";
import type { ServicePluginContext, WebRouteDefinition } from "@brains/plugins";
import { renderAdminShellHtml } from "./admin-shell";

// The release bundle copies this named asset beside the other console UIs.
const uiAssetFile = join(import.meta.dir, "..", "dist", "ui", "admin-app.js");

export interface AdminRouteOptions {
  routePath: string;
  getContext: () => ServicePluginContext;
  resolvePrincipal: (
    request: Request,
  ) => Promise<AuthAdminPrincipal | undefined>;
}

export function createAdminRoutes(
  options: AdminRouteOptions,
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
        const appInfo = await context.appInfo();
        return new Response(
          renderAdminShellHtml({
            assetPath: assetHref,
            routePath: options.routePath,
            userId: principal.userId,
            displayName: principal.displayName,
            role: principal.role,
            isAnchor: principal.isAnchor,
            brainName: appInfo.model,
            surfaces: deriveConsoleSurfaces(context.webRoutes.getRoutes(), {
              activeId: "admin",
              self: { id: "admin", href: options.routePath },
            }),
            sessionHref: `/logout?return_to=${encodeURIComponent(options.routePath)}`,
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
          return new Response("Admin console UI asset not built", {
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
