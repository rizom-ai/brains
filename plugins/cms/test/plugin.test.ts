import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthServicePlugin } from "@brains/auth-service";
import type { WebRouteDefinition } from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/test-utils";
import { cmsPlugin } from "../src";

function createCmsTestShell(): MockShell {
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
  expect(route).toBeDefined();
  return route as WebRouteDefinition;
}

describe("cms plugin", () => {
  it("registers exactly the editor routes", async () => {
    const shell = createCmsTestShell();
    const plugin = cmsPlugin();

    await plugin.register(shell);

    const routes = plugin.getWebRoutes();
    expect(
      routes.map((route) => `${route.method ?? "GET"} ${route.path}`),
    ).toEqual([
      "GET /cms",
      "GET /cms/assets/app.js",
      "GET /cms/api/types",
      "GET /cms/api/workspace",
      "POST /cms/api/workspace",
      "GET /cms/api/schema",
      "GET /cms/api/entities",
      "PUT /cms/api/entities",
      "POST /cms/api/entities",
      "DELETE /cms/api/entities",
      "POST /cms/api/upload",
      "POST /cms/api/assist",
      "GET /cms/api/agents",
      "POST /cms/api/ask-agent",
      "GET /cms/api/sync-status",
    ]);
  });

  it("always gates the editor shell on an auth session", async () => {
    const shell = createCmsTestShell();
    const plugin = cmsPlugin();

    await plugin.register(shell);

    const response = await findRoute(plugin.getWebRoutes(), "/cms").handler(
      new Request("https://yeehaa.io/cms"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?return_to=%2Fcms");
  });

  it("does not grant CMS access to a non-Anchor session", async () => {
    const shell = createCmsTestShell();
    const authPlugin = new AuthServicePlugin({
      storageDir: await mkdtemp(join(tmpdir(), "brains-cms-auth-")),
    });
    await authPlugin.register(shell);
    const trusted = await authPlugin.getService().createUser({
      displayName: "Trusted editor",
      role: "trusted",
    });
    const session = await authPlugin
      .getService()
      .createAuthSession(trusted.userId);
    const plugin = cmsPlugin();
    await plugin.register(shell);

    const request = new Request("https://yeehaa.io/cms", {
      headers: { Cookie: session.cookie },
    });
    const [shellResponse, apiResponse] = await Promise.all([
      findRoute(plugin.getWebRoutes(), "/cms").handler(request),
      findRoute(plugin.getWebRoutes(), "/cms/api/types").handler(request),
    ]);

    expect(shellResponse.status).toBe(302);
    expect(apiResponse.status).toBe(401);
  });

  it("respects a custom route path", async () => {
    const shell = createCmsTestShell();
    const plugin = cmsPlugin({ routePath: "/studio" });

    await plugin.register(shell);

    const paths = plugin.getWebRoutes().map((route) => route.path);
    expect(paths).toContain("/studio");
    expect(paths).toContain("/studio/api/entities");
    expect(paths).not.toContain("/cms");
  });

  it("advertises the CMS endpoint so the dashboard can link to it", async () => {
    const shell = createCmsTestShell();
    const plugin = cmsPlugin();

    await plugin.register(shell);

    const endpoints = shell.listEndpoints();
    const cms = endpoints.find((e) => e.label === "CMS");
    expect(cms).toBeDefined();
    expect(cms?.url).toBe("/cms");
    expect(cms?.pluginId).toBe("cms");
  });
});
