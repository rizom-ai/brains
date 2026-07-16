import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthServicePlugin } from "@brains/auth-service";
import type { WebRouteDefinition } from "@brains/plugins";
import { createMockShell } from "@brains/test-utils";
import { peoplePlugin } from "../src";

function findRoute(
  routes: WebRouteDefinition[],
  path: string,
): WebRouteDefinition {
  const route = routes.find((candidate) => candidate.path === path);
  expect(route).toBeDefined();
  return route as WebRouteDefinition;
}

describe("admin console plugin", () => {
  it("registers the Admin surface and browser asset", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const plugin = peoplePlugin();
    await plugin.register(shell);

    expect(plugin.getWebRoutes().map((route) => route.path)).toEqual([
      "/admin",
      "/admin/assets/app.js",
    ]);
    expect(shell.listEndpoints()).toContainEqual(
      expect.objectContaining({
        pluginId: "admin",
        label: "Admin",
        url: "/admin",
        visibility: "anchor",
      }),
    );
  });

  it("redirects unauthenticated callers to login", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const plugin = peoplePlugin();
    await plugin.register(shell);

    const response = await findRoute(plugin.getWebRoutes(), "/admin").handler(
      new Request("https://brain.test/admin"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?return_to=%2Fadmin");
  });

  it("serves an instrument-climate shell to authenticated people", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const authPlugin = new AuthServicePlugin({
      storageDir: await mkdtemp(join(tmpdir(), "brains-people-auth-")),
    });
    await authPlugin.register(shell);
    const trusted = await authPlugin.getService().createUser({
      displayName: "Mira Reyes",
      role: "trusted",
      status: "active",
    });
    const session = await authPlugin
      .getService()
      .createAuthSession(trusted.userId);
    const plugin = peoplePlugin();
    await plugin.register(shell);

    const response = await findRoute(plugin.getWebRoutes(), "/admin").handler(
      new Request("https://brain.test/admin", {
        headers: { Cookie: session.cookie },
      }),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('data-climate="instrument"');
    expect(html).toContain('data-people-role="trusted"');
    expect(html).toContain("Mira Reyes");
    expect(html).toContain('src="/admin/assets/app.js"');
    expect(html).toContain('class="surface-nav-link is-active" href="/admin"');
  });

  it("respects a custom route path", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const plugin = peoplePlugin({ routePath: "/access" });
    await plugin.register(shell);

    expect(plugin.getWebRoutes().map((route) => route.path)).toEqual([
      "/access",
      "/access/assets/app.js",
    ]);
  });
});
