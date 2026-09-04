import { describe, expect, it } from "bun:test";
import {
  createMockShell,
  createTempDataDir,
  type MockShell,
} from "@brains/plugins/test";
import { AuthServicePlugin } from "@brains/auth-service";
import type { WebRouteDefinition } from "@brains/plugins";

import { studioPlugin } from "../src";

function createStudioTestShell(): MockShell {
  return createMockShell({ domain: "yeehaa.io" });
}

function findRoute(
  routes: WebRouteDefinition[],
  path: string,
  method: WebRouteDefinition["method"] = "GET",
): WebRouteDefinition {
  const route = routes.find((candidate) => {
    return candidate.path === path && (candidate.method ?? "GET") === method;
  });
  if (!route) throw new Error(`Missing Studio route: ${path}`);
  return route;
}

describe("studio plugin", () => {
  it("uses the canonical Studio identity and redirects legacy CMS paths", async () => {
    const shell = createStudioTestShell();
    const plugin = studioPlugin();

    await plugin.register(shell);

    const paths = plugin.getWebRoutes().map((route) => route.path);
    expect(paths).toContain("/chat");
    expect(paths).toContain("/studio");
    expect(paths).toContain("/studio/api/entities");
    expect(paths).toContain("/cms");
    expect(paths).toContain("/account");
    expect(paths).toContain("/admin");

    const legacyRoute = findRoute(plugin.getWebRoutes(), "/cms");
    const redirects: ReadonlyArray<{
      source: string;
      destination: string;
    }> = [
      { source: "/cms?from=bookmark", destination: "/studio?from=bookmark" },
      {
        source: "/cms/entities/note/journal%2Fday-one?view=edit",
        destination: "/studio/entities/note/journal%2Fday-one?view=edit",
      },
      {
        source: "/cms/workspaces/site-builder%3Asite?tab=preview",
        destination: "/studio/workspaces/site-builder%3Asite?tab=preview",
      },
    ];
    for (const { source, destination } of redirects) {
      const redirect = await legacyRoute.handler(
        new Request(`https://yeehaa.io${source}`),
      );
      expect(redirect.status).toBe(308);
      expect(redirect.headers.get("location")).toBe(destination);
    }

    const accountRedirect = await findRoute(
      plugin.getWebRoutes(),
      "/account",
    ).handler(new Request("https://yeehaa.io/account?section=passkeys"));
    expect(accountRedirect.status).toBe(308);
    expect(accountRedirect.headers.get("location")).toBe(
      "/studio/workspaces/studio%3Aaccount?section=passkeys",
    );

    const adminRedirect = await findRoute(
      plugin.getWebRoutes(),
      "/admin",
    ).handler(new Request("https://yeehaa.io/admin/people?person=private"));
    expect(adminRedirect.status).toBe(308);
    expect(adminRedirect.headers.get("location")).toBe("/studio");

    expect(shell.listEndpoints()).toContainEqual(
      expect.objectContaining({
        label: "Studio",
        pluginId: "studio",
        url: "/studio",
      }),
    );
  });

  it("registers exactly the editor routes", async () => {
    const shell = createStudioTestShell();
    const plugin = studioPlugin();

    await plugin.register(shell);

    const routes = plugin.getWebRoutes();
    expect(
      routes.map(
        (route) =>
          `${route.method ?? "GET"} ${route.path} ${route.match ?? "exact"}`,
      ),
    ).toEqual([
      "GET /cms prefix",
      "GET /account prefix",
      "GET /admin prefix",
      "GET /chat exact",
      "GET /studio exact",
      "GET /studio/entities prefix",
      "GET /studio/workspaces prefix",
      "GET /studio/assets prefix",
      "GET /studio/api/types exact",
      "GET /studio/api/workspace exact",
      "POST /studio/api/workspace exact",
      "GET /studio/api/schema exact",
      "GET /studio/api/entities exact",
      "PUT /studio/api/entities exact",
      "POST /studio/api/entities exact",
      "DELETE /studio/api/entities exact",
      "POST /studio/api/upload exact",
      "POST /studio/api/assist exact",
      "GET /studio/api/agents exact",
      "POST /studio/api/ask-agent exact",
      "GET /studio/api/sync-status exact",
    ]);
  });

  it("always gates the Studio and canonical Chat shells on an auth session", async () => {
    const shell = createStudioTestShell();
    const plugin = studioPlugin();

    await plugin.register(shell);

    const studioResponse = await findRoute(
      plugin.getWebRoutes(),
      "/studio",
    ).handler(new Request("https://yeehaa.io/studio"));
    const chatResponse = await findRoute(
      plugin.getWebRoutes(),
      "/chat",
    ).handler(new Request("https://yeehaa.io/chat?session=thread-1"));

    expect(studioResponse.status).toBe(302);
    expect(studioResponse.headers.get("location")).toBe(
      "/login?return_to=%2Fstudio",
    );
    expect(chatResponse.status).toBe(302);
    expect(chatResponse.headers.get("location")).toBe(
      "/login?return_to=%2Fchat%3Fsession%3Dthread-1",
    );
  });

  it("grants Studio access to an active Trusted session", async () => {
    const shell = createStudioTestShell();
    const authPlugin = new AuthServicePlugin({
      storageDir: await createTempDataDir("brains-studio-auth-"),
    });
    await authPlugin.register(shell);
    const trusted = await authPlugin.getService().createUser({
      displayName: "Trusted editor",
      role: "trusted",
    });
    const session = await authPlugin
      .getService()
      .createAuthSession(trusted.userId);
    const plugin = studioPlugin();
    await plugin.register(shell);

    const request = new Request("https://yeehaa.io/studio", {
      headers: { Cookie: session.cookie },
    });
    const [shellResponse, apiResponse] = await Promise.all([
      findRoute(plugin.getWebRoutes(), "/studio").handler(request),
      findRoute(plugin.getWebRoutes(), "/studio/api/types").handler(request),
    ]);

    expect(shellResponse.status).toBe(200);
    expect(apiResponse.status).toBe(200);
  });

  it("preserves a deep Studio path through authentication", async () => {
    const shell = createStudioTestShell();
    const plugin = studioPlugin();

    await plugin.register(shell);

    const route = findRoute(plugin.getWebRoutes(), "/studio/entities");
    expect(route.match).toBe("prefix");
    const response = await route.handler(
      new Request(
        "https://yeehaa.io/studio/entities/note/journal%2Fday-one?view=edit",
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/login?return_to=%2Fstudio%2Fentities%2Fnote%2Fjournal%252Fday-one%3Fview%3Dedit",
    );
  });

  it("rejects the retired CMS mount as Studio's canonical route", () => {
    expect(() => studioPlugin({ routePath: "/cms" })).toThrow(
      /reserved for Studio redirects/i,
    );
  });

  it("respects a custom route path while retaining the legacy redirect", async () => {
    const shell = createStudioTestShell();
    const plugin = studioPlugin({ routePath: "/authoring" });

    await plugin.register(shell);

    const paths = plugin.getWebRoutes().map((route) => route.path);
    expect(paths).toContain("/authoring");
    expect(paths).toContain("/authoring/api/entities");
    expect(paths).toContain("/cms");
  });

  it("advertises the Studio endpoint so the dashboard can link to it", async () => {
    const shell = createStudioTestShell();
    const plugin = studioPlugin();

    await plugin.register(shell);

    const endpoints = shell.listEndpoints();
    const studio = endpoints.find((e) => e.label === "Studio");
    expect(studio).toBeDefined();
    expect(studio?.url).toBe("/studio");
    expect(studio?.pluginId).toBe("studio");
    expect(studio).toMatchObject({
      visibility: "public",
      requiresActiveSession: true,
    });
    expect(
      shell
        .listInteractions()
        .find((interaction) => interaction.id === "studio"),
    ).toMatchObject({
      visibility: "public",
      requiresActiveSession: true,
    });
  });
});
