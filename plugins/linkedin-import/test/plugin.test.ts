import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type { LinkedInAnchorSession } from "../src/lib/linkedin-oauth-routes";
import { LinkedInImportPlugin } from "../src/plugin";

async function resolveAnchorSession(): Promise<LinkedInAnchorSession> {
  return { id: "session-one", subject: "anchor" };
}

describe("LinkedInImportPlugin", () => {
  it("is inert without an access token", async () => {
    const harness = createPluginHarness();
    const plugin = new LinkedInImportPlugin();

    await harness.installPlugin(plugin);

    expect(
      harness
        .getCapabilities()
        .tools.filter((tool) => tool.name.startsWith("linkedin-import")),
    ).toEqual([]);
  });

  it("does not expose agent tools for static or dynamic credentials", async () => {
    const plugins = [
      new LinkedInImportPlugin({ accessToken: "test-token" }),
      new LinkedInImportPlugin(
        {},
        {
          accessTokenProvider: {
            getAccessToken: async (): Promise<undefined> => undefined,
          },
        },
      ),
    ];

    for (const plugin of plugins) {
      const harness = createPluginHarness();
      await harness.installPlugin(plugin);
      expect(
        harness
          .getCapabilities()
          .tools.filter((tool) => tool.name.startsWith("linkedin-import")),
      ).toEqual([]);
    }
  });

  it("exposes direct OAuth routes only with complete config and injected boundaries", () => {
    const plugin = new LinkedInImportPlugin(
      {
        oauth: {
          mode: "direct",
          clientId: "client-id",
          clientSecret: "client-secret",
          redirectUri: "https://brain.example/linkedin/oauth/direct/callback",
        },
      },
      {
        oauthTokenStore: {
          getAccessToken: async (): Promise<undefined> => undefined,
          getStatus: async (): Promise<{ connected: false }> => ({
            connected: false,
          }),
          storeToken: async (): Promise<void> => undefined,
          clearToken: async (): Promise<void> => undefined,
        },
        resolveAnchorSession,
      },
    );

    expect(
      plugin.getWebRoutes().map((route) => [route.method, route.path]),
    ).toEqual([
      ["GET", "/linkedin/admin/status"],
      ["POST", "/linkedin/admin/connect"],
      ["GET", "/linkedin/oauth/direct/callback"],
      ["POST", "/linkedin/admin/disconnect"],
      ["POST", "/linkedin/admin/preview"],
      ["POST", "/linkedin/admin/import"],
    ]);
    expect(new LinkedInImportPlugin().getWebRoutes()).toEqual([]);
  });

  it("exposes managed OAuth routes from instance plugin config", () => {
    const plugin = new LinkedInImportPlugin(
      {
        oauth: {
          mode: "broker",
          baseUrl: "https://connect.example",
          instanceId: "brain-one",
          instanceSecret: "instance-secret-000000000000000000000000",
        },
      },
      {
        oauthTokenStore: {
          getAccessToken: async (): Promise<undefined> => undefined,
          getStatus: async (): Promise<{ connected: false }> => ({
            connected: false,
          }),
          storeToken: async (): Promise<void> => undefined,
          clearToken: async (): Promise<void> => undefined,
        },
        resolveAnchorSession,
      },
    );

    expect(
      plugin.getWebRoutes().map((route) => [route.method, route.path]),
    ).toEqual([
      ["GET", "/linkedin/admin/status"],
      ["POST", "/linkedin/admin/connect"],
      ["GET", "/linkedin/oauth/broker/return"],
      ["POST", "/linkedin/admin/disconnect"],
      ["POST", "/linkedin/admin/preview"],
      ["POST", "/linkedin/admin/import"],
    ]);
  });

  it("rejects invalid OAuth configuration", () => {
    expect(
      () =>
        new LinkedInImportPlugin({
          oauth: {
            mode: "direct",
            clientId: "client-id",
            clientSecret: "client-secret",
            redirectUri: "not-a-url",
          },
        }),
    ).toThrow("Invalid plugin config for linkedin-import");
  });
});
