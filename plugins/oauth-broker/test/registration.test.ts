import { describe, expect, it } from "bun:test";
import type { OAuthBrokerProvider } from "@brains/contracts";
import type { PluginCapabilities } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { brokerRoutes, createOAuthBrokerPlugins } from "./broker-plugins";

const config = {
  publicUrl: "https://connect.example",
  providers: { linkedin: { clientId: "app", clientSecret: "app-secret" } },
  instances: [
    {
      id: "ada",
      secret: "i".repeat(40),
      returnUris: {
        linkedin: "https://ada.example/linkedin/oauth/broker/return",
      },
    },
  ],
};

/** A provider adapter that never reaches a provider. */
function fakeProvider(id = "linkedin"): () => OAuthBrokerProvider {
  return (): OAuthBrokerProvider => ({
    id,
    authorizationUrl: (): URL => new URL("https://provider.example/consent"),
    exchange: async (): Promise<Record<string, string>> => ({}),
  });
}

async function installed(
  overrides: Record<string, unknown> = {},
  options: { executionOnly?: boolean; provider?: string } = {},
): Promise<{
  shell: ReturnType<typeof createMockShell>;
  plugins: ReturnType<typeof createOAuthBrokerPlugins>;
  capabilities: PluginCapabilities[];
}> {
  const shell = createMockShell();
  const plugins = createOAuthBrokerPlugins(
    { ...config, ...overrides },
    { providers: { linkedin: fakeProvider(options.provider) } },
  );
  const capabilities: PluginCapabilities[] = [];
  for (const plugin of plugins) {
    capabilities.push(
      await plugin.register(
        shell,
        options.executionOnly ? { executionOnly: true } : undefined,
      ),
    );
  }
  return { shell, plugins, capabilities };
}

/**
 * What the OAuth broker registers, pinned as the broker plugin class
 * registered it: instance brains reach it only through its three public
 * routes, and it registers nothing else.
 */
describe("the OAuth broker's registered surface", () => {
  it("is the oauth-broker service, with no tools, resources, API routes, jobs, templates, data sources or types", async () => {
    const { shell, plugins, capabilities } = await installed();
    expect(
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]),
    ).toEqual([["oauth-broker", "service", "@brains/oauth-broker", []]]);
    expect(capabilities.flatMap(({ tools }) => tools)).toEqual([]);
    expect(capabilities.flatMap(({ resources }) => resources)).toEqual([]);
    expect(
      capabilities.map(({ instructions }) => instructions ?? null),
    ).toEqual([null]);
    for (const plugin of plugins) {
      expect(plugin.getApiRoutes?.() ?? []).toEqual([]);
    }
    expect(shell.getJobQueueService().getRegisteredTypes()).toEqual([]);
    expect([...shell.getTemplates().keys()]).toEqual([]);
    expect(shell.getDataSourceRegistry().list()).toEqual([]);
    expect(shell.getEntityRegistry().getAllEntityTypes()).toEqual([]);
  });

  it("serves its three public routes, in every process", async () => {
    for (const executionOnly of [false, true]) {
      const { plugins } = await installed({}, { executionOnly });
      expect(
        brokerRoutes(plugins).map(({ handler: _handler, ...route }) => route),
      ).toEqual([
        {
          path: "/oauth-broker/authorizations",
          method: "POST",
          public: true,
        },
        { path: "/oauth-broker/grants/redeem", method: "POST", public: true },
        {
          path: "/oauth-broker/callback/linkedin",
          method: "GET",
          public: true,
        },
      ]);
    }
  });

  it("serves nothing without instances or without providers", async () => {
    for (const overrides of [{ instances: [] }, { providers: {} }]) {
      const { plugins } = await installed(overrides);
      expect(brokerRoutes(plugins)).toEqual([]);
    }
  });

  it("refuses an adapter that reports another provider", async () => {
    expect(installed({}, { provider: "github" })).rejects.toThrow(
      'oauth-broker: adapter for "linkedin" reports provider "github"',
    );
  });

  it("refuses a configuration that is not a broker's", async () => {
    expect(() =>
      createOAuthBrokerPlugins(
        { ...config, publicUrl: "ftp://connect.example" },
        { providers: {} },
      ),
    ).toThrow();
  });
});
