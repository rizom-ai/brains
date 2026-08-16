import { describe, expect, it } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import type { WebRouteDefinition } from "@brains/plugins";
import { createMockShell, createTempDir } from "@brains/test-utils";
import { adminPlugin } from "../src";

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
    const plugin = adminPlugin();
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
        visibility: "admin",
      }),
    );
  });

  it("redirects unauthenticated callers to login without dropping a person target", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const plugin = adminPlugin();
    await plugin.register(shell);

    const response = await findRoute(plugin.getWebRoutes(), "/admin").handler(
      new Request("https://brain.test/admin?person=prsn_contact"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/login?return_to=%2Fadmin%3Fperson%3Dprsn_contact",
    );
  });

  it("serves an instrument-climate shell to Admins", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const authPlugin = new AuthServicePlugin({
      storageDir: await createTempDir("brains-people-auth-"),
    });
    await authPlugin.register(shell);
    const admin = await authPlugin.getService().createUser({
      displayName: "Mira Reyes",
      role: "admin",
      status: "active",
    });
    const session = await authPlugin
      .getService()
      .createAuthSession(admin.userId);
    shell.addPlugin({
      id: "chat",
      packageName: "@brains/chat",
    } as never);
    const plugin = adminPlugin();
    await plugin.register(shell);

    const response = await findRoute(plugin.getWebRoutes(), "/admin").handler(
      new Request(`https://brain.test/admin?person=${admin.personId}`, {
        headers: { Cookie: session.cookie },
      }),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('data-climate="instrument"');
    expect(html).toContain('data-people-role="admin"');
    expect(html).toContain(`data-people-person="${admin.personId}"`);
    expect(html).toContain("data-people-brain-name=");
    expect(html).not.toContain("data-people-interfaces");
    expect(html).toContain("Mira Reyes");
    expect(html).toMatch(/src="\/admin\/assets\/app\.js\?v=[a-z0-9]+"/);
    expect(html).toContain(
      'class="surface-nav-link is-active" href="/admin" data-console-surface="admin"',
    );
  });

  it("ignores malformed person targets", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const authPlugin = new AuthServicePlugin({
      storageDir: await createTempDir("brains-people-auth-"),
    });
    await authPlugin.register(shell);
    const admin = await authPlugin.getService().createUser({
      displayName: "Mira Reyes",
      role: "admin",
      status: "active",
    });
    const session = await authPlugin
      .getService()
      .createAuthSession(admin.userId);
    const plugin = adminPlugin();
    await plugin.register(shell);

    const response = await findRoute(plugin.getWebRoutes(), "/admin").handler(
      new Request("https://brain.test/admin?person=%00private", {
        headers: { Cookie: session.cookie },
      }),
    );

    expect(await response.text()).not.toContain("data-people-person=");
  });

  it("redirects authenticated non-Admins to their own account surface", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const authPlugin = new AuthServicePlugin({
      storageDir: await createTempDir("brains-people-auth-"),
    });
    await authPlugin.register(shell);
    const trusted = await authPlugin.getService().createUser({
      displayName: "Trusted collaborator",
      role: "trusted",
      status: "active",
    });
    const session = await authPlugin
      .getService()
      .createAuthSession(trusted.userId);
    const plugin = adminPlugin();
    await plugin.register(shell);

    const response = await findRoute(plugin.getWebRoutes(), "/admin").handler(
      new Request("https://brain.test/admin", {
        headers: { Cookie: session.cookie },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/account");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not let browsers reuse a stale Admin bundle", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const plugin = adminPlugin();
    await plugin.register(shell);

    const response = await findRoute(
      plugin.getWebRoutes(),
      "/admin/assets/app.js",
    ).handler(new Request("https://brain.test/admin/assets/app.js"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("respects a custom route path", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const plugin = adminPlugin({ routePath: "/access" });
    await plugin.register(shell);

    expect(plugin.getWebRoutes().map((route) => route.path)).toEqual([
      "/access",
      "/access/assets/app.js",
    ]);
  });
});
