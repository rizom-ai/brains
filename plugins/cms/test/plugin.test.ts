import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import {
  createServicePluginContext,
  PluginConfigValidationError,
  type WebRouteDefinition,
} from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/test-utils";
import { fromYaml } from "@brains/utils";
import { z } from "@brains/utils/zod-v4";
import { cmsPlugin, buildCmsConfigYaml, renderCmsShellHtml } from "../src";

function createCmsTestShell(
  options: {
    domain?: string;
  } = {},
): MockShell {
  const shell = createMockShell({
    ...(options.domain && { domain: options.domain }),
  });
  shell.getMessageBus().subscribe("git-sync:get-repo-info", async () => ({
    success: true,
    data: { repo: "owner/repo", branch: "main" },
  }));

  shell.getEntityService = (): ReturnType<MockShell["getEntityService"]> =>
    ({
      getEntityTypes: (): string[] => ["note", "post"],
    }) as ReturnType<MockShell["getEntityService"]>;

  shell.getEntityRegistry = (): ReturnType<MockShell["getEntityRegistry"]> =>
    ({
      getEffectiveFrontmatterSchema: (
        type: string,
      ): z.ZodObject<z.ZodRawShape> | undefined => {
        if (type === "note" || type === "post") {
          return z.object({
            title: z.string().optional(),
            summary: z.string().optional(),
          });
        }
        return undefined;
      },
      getAdapter: (
        type: string,
      ): { isSingleton: false; hasBody: true } | undefined => {
        if (type === "note" || type === "post") {
          return { isSingleton: false, hasBody: true };
        }
        return undefined;
      },
    }) as ReturnType<MockShell["getEntityRegistry"]>;

  return shell;
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
  it("buildCmsConfigYaml should generate yaml from the plugin context", async () => {
    const shell = createCmsTestShell({ domain: "yeehaa.io" });
    const context = createServicePluginContext(shell, "cms");
    const yaml = await buildCmsConfigYaml(context, {
      entityDisplay: {
        post: { label: "Essay" },
      },
    });
    const parsed = fromYaml<{
      backend: {
        repo: string;
        branch: string;
        base_url?: string;
        auth_endpoint?: string;
      };
      collections: Array<{ name: string; label: string }>;
    }>(yaml);

    expect(parsed.backend.repo).toBe("owner/repo");
    expect(parsed.backend.branch).toBe("main");
    expect(parsed.backend.base_url).toBeUndefined();
    expect(parsed.backend.auth_endpoint).toBeUndefined();
    expect(
      parsed.collections.some(
        (collection) =>
          collection.name === "post" && collection.label === "Essays",
      ),
    ).toBe(true);
  });

  it("uses entityDisplay from plugin context when config does not provide it", async () => {
    const shell = createCmsTestShell({ domain: "yeehaa.io" });
    const plugin = cmsPlugin();

    await plugin.register(shell, {
      entityDisplay: {
        post: { label: "Essay" },
      },
    });

    const configRoute = plugin.getWebRoutes()[1];
    const response = await configRoute?.handler(
      new Request("http://brain/cms/config.yml"),
    );
    expect(response?.status).toBe(200);

    const yaml = await response?.text();
    expect(yaml).toContain("name: post");
    expect(yaml).toContain("label: Essays");
  });

  it("should default to /cms for the shell route and config route", async () => {
    const shell = createCmsTestShell({ domain: "yeehaa.io" });
    const plugin = cmsPlugin();

    await plugin.register(shell);

    const routes = plugin.getWebRoutes();
    expect(routes).toHaveLength(2);
    expect(routes.map((route) => route.path)).toEqual([
      "/cms",
      "/cms/config.yml",
    ]);

    const cmsRoute = routes[0];
    const configRoute = routes[1];

    const cmsResponse = await cmsRoute?.handler(
      new Request("http://brain/cms"),
    );
    expect(cmsResponse?.status).toBe(200);
    expect(cmsResponse?.headers.get("content-type")).toContain("text/html");
    const cmsHtml = await cmsResponse?.text();
    expect(cmsHtml).toContain("Content Manager");
    expect(cmsHtml).toContain('rel="cms-config-url"');
    expect(cmsHtml).toContain('href="/cms/config.yml"');
    expect(cmsHtml).toContain(
      '<script src="https://unpkg.com/@sveltia/cms@0.165.1/dist/sveltia-cms.js"></script>',
    );

    const configResponse = await configRoute?.handler(
      new Request("http://brain/cms/config.yml"),
    );
    expect(configResponse?.status).toBe(200);
    expect(configResponse?.headers.get("content-type")).toContain(
      "application/yaml",
    );
    const configYaml = await configResponse?.text();
    expect(configYaml).toContain("owner/repo");
    expect(configYaml).toContain("branch: main");
    expect(configYaml).not.toContain("base_url");
    expect(configYaml).not.toContain("auth_endpoint");

    const expectedHtml = renderCmsShellHtml({
      cmsConfigPath: "/cms/config.yml",
    });
    expect(cmsHtml).toBe(expectedHtml);
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

  it("adds auth_endpoint and auth routes only when a login method is enabled", async () => {
    const shell = createCmsTestShell({ domain: "yeehaa.io" });
    const plugin = cmsPlugin({
      passkeyLogin: { contentRepoToken: "ghp_shared" },
    });

    await plugin.register(shell);

    const routes = plugin.getWebRoutes();
    expect(
      routes.map((route) => `${route.method ?? "GET"} ${route.path}`),
    ).toEqual([
      "GET /cms",
      "GET /cms/config.yml",
      "GET /auth",
      "POST /auth/cms-token",
    ]);

    const configResponse = await findRoute(routes, "/cms/config.yml").handler(
      new Request("https://yeehaa.io/cms/config.yml"),
    );
    const parsed = fromYaml<{
      backend: { base_url?: string; auth_endpoint?: string };
    }>(await configResponse.text());
    expect(parsed.backend.base_url).toBe("https://yeehaa.io");
    expect(parsed.backend.auth_endpoint).toBe("auth");
  });

  it("serves a pre-authorized CMS shell for logged-in passkey CMS operators", async () => {
    const shell = createCmsTestShell({ domain: "yeehaa.io" });
    const authPlugin = new AuthServicePlugin({
      storageDir: await mkdtemp(join(tmpdir(), "brains-cms-auth-")),
    });
    await authPlugin.register(shell);
    const session = await authPlugin.getService().createOperatorSession();

    const plugin = cmsPlugin({
      passkeyLogin: { contentRepoToken: "ghp_secret_pat" },
    });
    await plugin.register(shell);

    const response = await findRoute(plugin.getWebRoutes(), "/cms").handler(
      new Request("https://yeehaa.io/cms", {
        headers: { Cookie: session.cookie },
      }),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Content Manager");
    expect(html).toContain("/auth/cms-token");
    expect(html).toContain("sveltia-cms.user");
    expect(html).toContain("sveltia-cms.js");
    expect(html).not.toContain("CMS passkey login");
    expect(html).not.toContain("ghp_secret_pat");
  });

  it("redirects unauthenticated passkey CMS visitors to operator login", async () => {
    const shell = createCmsTestShell({ domain: "yeehaa.io" });
    const plugin = cmsPlugin({
      passkeyLogin: { contentRepoToken: "ghp_secret_pat" },
    });
    await plugin.register(shell);

    const response = await findRoute(plugin.getWebRoutes(), "/cms").handler(
      new Request("https://yeehaa.io/cms"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?return_to=%2Fcms");
  });

  it("serves the passkey login page without embedding the PAT", async () => {
    const shell = createCmsTestShell({ domain: "yeehaa.io" });
    const plugin = cmsPlugin({
      passkeyLogin: { contentRepoToken: "ghp_secret_pat" },
    });

    await plugin.register(shell);

    const response = await findRoute(plugin.getWebRoutes(), "/auth").handler(
      new Request("https://yeehaa.io/auth"),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("CMS passkey login");
    expect(html).toContain("/webauthn/auth/options");
    expect(html).toContain("/auth/cms-token");
    expect(html).not.toContain("ghp_secret_pat");
    expect(html).not.toContain('postMessage(message, "*")');
  });

  it("requires an operator session before releasing the passkey PAT", async () => {
    const shell = createCmsTestShell({ domain: "yeehaa.io" });
    const plugin = cmsPlugin({
      passkeyLogin: { contentRepoToken: "ghp_secret_pat" },
    });

    await plugin.register(shell);

    const response = await findRoute(
      plugin.getWebRoutes(),
      "/auth/cms-token",
      "POST",
    ).handler(
      new Request("https://yeehaa.io/auth/cms-token", { method: "POST" }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Operator session required",
    });
  });

  it("returns the passkey PAT with a valid operator session", async () => {
    const shell = createCmsTestShell({ domain: "yeehaa.io" });
    const authPlugin = new AuthServicePlugin({
      storageDir: await mkdtemp(join(tmpdir(), "brains-cms-auth-")),
    });
    await authPlugin.register(shell);
    const session = await authPlugin.getService().createOperatorSession();

    const plugin = cmsPlugin({
      passkeyLogin: { contentRepoToken: "ghp_secret_pat" },
    });
    await plugin.register(shell);

    const response = await findRoute(
      plugin.getWebRoutes(),
      "/auth/cms-token",
      "POST",
    ).handler(
      new Request("https://yeehaa.io/auth/cms-token", {
        method: "POST",
        headers: { Cookie: session.cookie },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      token: "ghp_secret_pat",
      provider: "github",
    });
  });

  it("auto-authorizes passkey CMS login when an operator session already exists", async () => {
    const shell = createCmsTestShell({ domain: "yeehaa.io" });
    const authPlugin = new AuthServicePlugin({
      storageDir: await mkdtemp(join(tmpdir(), "brains-cms-auth-")),
    });
    await authPlugin.register(shell);
    const session = await authPlugin.getService().createOperatorSession();

    const plugin = cmsPlugin({
      passkeyLogin: { contentRepoToken: "ghp_secret_pat" },
    });
    await plugin.register(shell);

    const response = await findRoute(plugin.getWebRoutes(), "/auth").handler(
      new Request("https://yeehaa.io/auth", {
        headers: { Cookie: session.cookie },
      }),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("CMS authorization");
    expect(html).toContain("/auth/cms-token");
    expect(html).toContain("postGitHubToken(result.token)");
    expect(html).not.toContain("/webauthn/auth/options");
    expect(html).not.toContain("ghp_secret_pat");
  });

  it("rejects configuring both login methods on a single brain", () => {
    expect(() =>
      cmsPlugin({
        githubOAuth: { clientId: "client-id", clientSecret: "client-secret" },
        passkeyLogin: { contentRepoToken: "ghp_secret_pat" },
      }),
    ).toThrow(PluginConfigValidationError);

    try {
      cmsPlugin({
        githubOAuth: { clientId: "client-id", clientSecret: "client-secret" },
        passkeyLogin: { contentRepoToken: "ghp_secret_pat" },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(PluginConfigValidationError);
      if (!(error instanceof PluginConfigValidationError)) {
        throw error;
      }
      expect(error.issues[0]?.message).toMatch(/single method/i);
    }
  });

  it("redirects GitHub login with a state cookie", async () => {
    const shell = createCmsTestShell({ domain: "yeehaa.io" });
    const plugin = cmsPlugin({
      githubOAuth: {
        clientId: "client-id",
        clientSecret: "client-secret",
        scope: "public_repo",
      },
    });
    await plugin.register(shell);

    const response = await findRoute(plugin.getWebRoutes(), "/auth").handler(
      new Request("https://yeehaa.io/auth"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("set-cookie")).toContain(
      "brains_cms_oauth_state=",
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");

    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin).toBe("https://github.com");
    expect(location.searchParams.get("client_id")).toBe("client-id");
    expect(location.searchParams.get("scope")).toBe("public_repo");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://yeehaa.io/auth/callback",
    );
    expect(location.searchParams.get("state")).toBeTruthy();
  });

  it("rejects GitHub callback state mismatches", async () => {
    const shell = createCmsTestShell({ domain: "yeehaa.io" });
    const plugin = cmsPlugin({
      githubOAuth: { clientId: "client-id", clientSecret: "client-secret" },
    });
    await plugin.register(shell);

    const response = await findRoute(
      plugin.getWebRoutes(),
      "/auth/callback",
    ).handler(
      new Request("https://yeehaa.io/auth/callback?code=abc&state=bad", {
        headers: { Cookie: "brains_cms_oauth_state=good" },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("state did not match");
  });

  it("exchanges GitHub callback codes and returns the Sveltia handshake", async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      requests.push({ input, ...(init ? { init } : {}) });
      return new Response(JSON.stringify({ access_token: "gho_editor" }), {
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const shell = createCmsTestShell({ domain: "yeehaa.io" });
      const plugin = cmsPlugin({
        githubOAuth: { clientId: "client-id", clientSecret: "client-secret" },
      });
      await plugin.register(shell);

      const response = await findRoute(
        plugin.getWebRoutes(),
        "/auth/callback",
      ).handler(
        new Request("https://yeehaa.io/auth/callback?code=abc&state=good", {
          headers: { Cookie: "brains_cms_oauth_state=good" },
        }),
      );
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(requests).toHaveLength(1);
      expect(String(requests[0]?.input)).toBe(
        "https://github.com/login/oauth/access_token",
      );
      expect(html).toContain("authorization:github:success:");
      expect(html).toContain("gho_editor");
      expect(html).toContain("https://yeehaa.io");
      expect(html).not.toContain('postMessage(message, "*")');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
