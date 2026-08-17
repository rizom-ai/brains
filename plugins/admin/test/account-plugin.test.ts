import { describe, expect, it } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import type { WebRouteDefinition } from "@brains/plugins";
import { createMockShell, createTempDir } from "@brains/test-utils";
import { accountPlugin } from "../src";

function findRoute(
  routes: WebRouteDefinition[],
  path: string,
): WebRouteDefinition {
  const route = routes.find((candidate) => candidate.path === path);
  expect(route).toBeDefined();
  return route as WebRouteDefinition;
}

async function createAuthenticatedAccount(
  role: "admin" | "trusted" | "public",
): Promise<{
  plugin: ReturnType<typeof accountPlugin>;
  session: { cookie: string };
}> {
  const shell = createMockShell({ domain: "brain.test" });
  const authPlugin = new AuthServicePlugin({
    storageDir: await createTempDir("brains-account-auth-"),
  });
  await authPlugin.register(shell);
  const user = await authPlugin.getService().createUser({
    displayName: "Mira Reyes",
    role,
    status: "active",
  });
  const session = await authPlugin.getService().createAuthSession(user.userId);
  const plugin = accountPlugin();
  await plugin.register(shell);
  return { plugin, session };
}

describe("account console plugin", () => {
  it("registers the self-service surface and browser asset", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const plugin = accountPlugin();
    await plugin.register(shell);

    expect(plugin.getWebRoutes().map((route) => route.path)).toEqual([
      "/account",
      "/account/assets/app.js",
    ]);
    expect(shell.listEndpoints()).toContainEqual(
      expect.objectContaining({
        pluginId: "account",
        label: "Account",
        url: "/account",
        visibility: "public",
      }),
    );
  });

  it("redirects unauthenticated callers to login", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const plugin = accountPlugin();
    await plugin.register(shell);

    const response = await findRoute(plugin.getWebRoutes(), "/account").handler(
      new Request("https://brain.test/account"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/login?return_to=%2Faccount",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  for (const role of ["admin", "trusted", "public"] as const) {
    it(`serves the shared console shell to an active ${role} account`, async () => {
      const { plugin, session } = await createAuthenticatedAccount(role);

      const response = await findRoute(
        plugin.getWebRoutes(),
        "/account",
      ).handler(
        new Request("https://brain.test/account", {
          headers: { Cookie: session.cookie },
        }),
      );
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(html).toContain('<html lang="en" data-climate="instrument">');
      expect(html).toContain('class="console-strip"');
      expect(html).toContain(
        'class="surface-nav-link is-active" href="/account"',
      );
      expect(html).toContain(`data-account-role="${role}"`);
      expect(html).toContain('data-account-name="Mira Reyes"');
      expect(html).toContain('localStorage.getItem("console.climate")');
      expect(html).toMatch(/src="\/account\/assets\/app\.js\?v=[a-z0-9]+"/);
    });
  }

  it("respects a custom route path", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const plugin = accountPlugin({ routePath: "/me" });
    await plugin.register(shell);

    expect(plugin.getWebRoutes().map((route) => route.path)).toEqual([
      "/me",
      "/me/assets/app.js",
    ]);
  });
});
