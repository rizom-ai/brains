import { describe, expect, it } from "bun:test";
import { createTempDataDir } from "@brains/plugins/test";
import { AuthServicePlugin } from "@brains/auth-service";
import type { WebRouteDefinition } from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/test-utils";
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
    expect(paths).toContain("/studio");
    expect(paths).toContain("/studio/api/entities");
    expect(paths).toContain("/cms");

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
      routes.map((route) => `${route.method ?? "GET"} ${route.path}`),
    ).toEqual([
      "GET /cms",
      "GET /studio",
      "GET /studio/entities",
      "GET /studio/workspaces",
      "GET /studio/assets/app.js",
      "GET /studio/api/types",
      "GET /studio/api/workspace",
      "POST /studio/api/workspace",
      "GET /studio/api/schema",
      "GET /studio/api/entities",
      "PUT /studio/api/entities",
      "POST /studio/api/entities",
      "DELETE /studio/api/entities",
      "POST /studio/api/upload",
      "POST /studio/api/assist",
      "GET /studio/api/agents",
      "POST /studio/api/ask-agent",
      "GET /studio/api/sync-status",
    ]);
  });

  it("always gates the editor shell on an auth session", async () => {
    const shell = createStudioTestShell();
    const plugin = studioPlugin();

    await plugin.register(shell);

    const response = await findRoute(plugin.getWebRoutes(), "/studio").handler(
      new Request("https://yeehaa.io/studio"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?return_to=%2Fstudio");
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
      /reserved for the Studio redirect/i,
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
