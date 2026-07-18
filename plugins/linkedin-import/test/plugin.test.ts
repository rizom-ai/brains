import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { LinkedInImportPlugin } from "../src/plugin";

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
        oauthClientId: "client-id",
        oauthClientSecret: "client-secret",
        oauthRedirectUri:
          "https://brain.example/linkedin/oauth/direct/callback",
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
        resolveAnchorSession: async (): Promise<boolean> => true,
      },
    );

    expect(
      plugin.getWebRoutes().map((route) => [route.method, route.path]),
    ).toEqual([
      ["GET", "/linkedin/admin/status"],
      ["POST", "/linkedin/admin/connect"],
      ["GET", "/linkedin/oauth/direct/callback"],
      ["POST", "/linkedin/admin/disconnect"],
    ]);
    expect(new LinkedInImportPlugin().getWebRoutes()).toEqual([]);
  });

  it("rejects partial OAuth configuration", () => {
    expect(
      () =>
        new LinkedInImportPlugin({
          oauthClientId: "client-id",
        }),
    ).toThrow("Invalid plugin config for linkedin-import");
  });
});
