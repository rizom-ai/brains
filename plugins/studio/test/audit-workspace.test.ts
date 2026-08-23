import { afterEach, describe, expect, it } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import type { WebRouteDefinition } from "@brains/plugins";
import { createTempDataDir } from "@brains/plugins/test";
import { createMockShell } from "@brains/test-utils";
import { studioPlugin, type StudioPlugin } from "../src";

const authPlugins: AuthServicePlugin[] = [];

function findRoute(plugin: StudioPlugin, path: string): WebRouteDefinition {
  const route = plugin
    .getWebRoutes()
    .find((candidate) => candidate.path === path && candidate.method === "GET");
  if (!route) throw new Error(`Missing route: ${path}`);
  return route;
}

async function responseJson(response: Response): Promise<unknown> {
  return response.json();
}

function workspaceId(input: unknown): string {
  if (input === null || typeof input !== "object") {
    throw new Error("Expected navigation response");
  }
  const workspaces = Reflect.get(input, "workspaces");
  if (!Array.isArray(workspaces)) throw new Error("Expected workspaces");
  const audit = workspaces.find(
    (workspace) =>
      workspace !== null &&
      typeof workspace === "object" &&
      Reflect.get(workspace, "label") === "Audit",
  );
  const id = audit && Reflect.get(audit, "id");
  if (typeof id !== "string") throw new Error("Expected Audit workspace id");
  return id;
}

afterEach(async () => {
  for (const plugin of authPlugins.splice(0)) {
    await plugin.shutdown?.();
  }
});

describe("built-in Studio Audit workspace", () => {
  it("admits only Admin actors and renders filtered URL-query detail", async () => {
    const shell = createMockShell({ domain: "yeehaa.io" });
    const auth = new AuthServicePlugin({
      storageDir: await createTempDataDir("brains-studio-audit-"),
    });
    authPlugins.push(auth);
    await auth.register(shell);
    const service = auth.getService();
    const admin = await service.createUser({
      displayName: "Ada Admin",
      role: "admin",
    });
    const trusted = await service.createUser({
      displayName: "Tess Trusted",
      role: "trusted",
    });
    const event = await service.recordAuditEvent({
      actorUserId: admin.userId,
      action: "auth.user.role_updated",
      targetType: "user",
      targetId: trusted.userId,
      metadata: { secret: "must-not-render" },
    });
    const [adminSession, trustedSession] = await Promise.all([
      service.createAuthSession(admin.userId),
      service.createAuthSession(trusted.userId),
    ]);

    const studio = studioPlugin();
    await studio.register(shell);
    await studio.finalizeRegistration();

    const typesRoute = findRoute(studio, "/studio/api/types");
    const adminNavigation = await responseJson(
      await typesRoute.handler(
        new Request("https://yeehaa.io/studio/api/types", {
          headers: { Cookie: adminSession.cookie },
        }),
      ),
    );
    const id = workspaceId(adminNavigation);
    expect(id).toBe("studio:audit");

    const trustedNavigation = await responseJson(
      await typesRoute.handler(
        new Request("https://yeehaa.io/studio/api/types", {
          headers: { Cookie: trustedSession.cookie },
        }),
      ),
    );
    expect(trustedNavigation).toMatchObject({ workspaces: [] });

    const workspaceRoute = findRoute(studio, "/studio/api/workspace");
    const response = await workspaceRoute.handler(
      new Request(
        `https://yeehaa.io/studio/api/workspace?id=${encodeURIComponent(id)}&action=${encodeURIComponent(event.action)}&selected=${encodeURIComponent(event.id)}`,
        { headers: { Cookie: adminSession.cookie } },
      ),
    );
    expect(response.status).toBe(200);
    const body = await responseJson(response);
    expect(body).toMatchObject({
      workspace: {
        id,
        data: {
          view: {
            title: "Audit",
            blocks: [
              {
                type: "query",
                pagination: { total: 1 },
              },
              {
                type: "detail",
                open: {
                  forId: event.id,
                  title: "Changed an account role",
                },
                master: {
                  type: "table",
                  rows: [
                    {
                      id: event.id,
                      cells: {
                        actor: "Ada Admin",
                        action: "Changed an account role",
                        target: "Tess Trusted",
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain("must-not-render");

    const deepLink = await responseJson(
      await workspaceRoute.handler(
        new Request(
          `https://yeehaa.io/studio/api/workspace?id=${encodeURIComponent(id)}&action=${encodeURIComponent(event.action)}&selected=${encodeURIComponent(event.id)}&offset=100`,
          { headers: { Cookie: adminSession.cookie } },
        ),
      ),
    );
    expect(deepLink).toMatchObject({
      workspace: {
        data: {
          view: {
            blocks: [
              {},
              {
                open: { forId: event.id },
                master: { rows: [] },
              },
            ],
          },
        },
      },
    });

    const denied = await workspaceRoute.handler(
      new Request(
        `https://yeehaa.io/studio/api/workspace?id=${encodeURIComponent(id)}`,
        { headers: { Cookie: trustedSession.cookie } },
      ),
    );
    expect(denied.status).toBe(404);
    expect(
      auth.getWebRoutes().some((route) => route.path === "/auth/admin/audit"),
    ).toBe(true);
  });
});
