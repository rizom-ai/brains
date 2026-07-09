import { describe, expect, it } from "bun:test";
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
      "GET /cms/api/schema",
      "GET /cms/api/entities",
      "PUT /cms/api/entities",
      "POST /cms/api/entities",
      "DELETE /cms/api/entities",
      "POST /cms/api/upload",
      "GET /cms/api/sync-status",
    ]);
  });

  it("always gates the editor shell on an operator session", async () => {
    const shell = createCmsTestShell();
    const plugin = cmsPlugin();

    await plugin.register(shell);

    const response = await findRoute(plugin.getWebRoutes(), "/cms").handler(
      new Request("https://yeehaa.io/cms"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?return_to=%2Fcms");
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
