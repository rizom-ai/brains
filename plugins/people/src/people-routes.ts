import { join } from "node:path";
import type { AuthAdminPrincipal } from "@brains/auth-service/admin-contracts";
import { deriveConsoleSurfaces } from "@brains/console-theme";
import type { ServicePluginContext, WebRouteDefinition } from "@brains/plugins";
import { renderPeopleShellHtml } from "./people-shell";

// The release bundle copies this named asset beside the other console UIs.
const uiAssetFile = join(import.meta.dir, "..", "dist", "ui", "people-app.js");

export interface PeopleRouteOptions {
  routePath: string;
  getContext: () => ServicePluginContext;
  resolvePrincipal: (
    request: Request,
  ) => Promise<AuthAdminPrincipal | undefined>;
}

export function createPeopleRoutes(
  options: PeopleRouteOptions,
): WebRouteDefinition[] {
  const assetPath = `${options.routePath}/assets/app.js`;

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

        return new Response(
          renderPeopleShellHtml({
            assetPath,
            routePath: options.routePath,
            displayName: principal.displayName,
            role: principal.role,
            surfaces: deriveConsoleSurfaces(
              options.getContext().webRoutes.getRoutes(),
              {
                activeId: "admin",
                self: { id: "admin", href: options.routePath },
              },
            ),
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
          return new Response("People UI asset not built", { status: 503 });
        }
        return new Response(file, {
          headers: {
            "Content-Type": "text/javascript; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  ];
}
