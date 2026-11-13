import { describe, expect, it } from "bun:test";
import type { Plugin, PluginCapabilities } from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import { createLinkedInImportPlugins } from "./linkedin-plugins";

const oauth = {
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUri: "https://brain.example/linkedin/oauth/callback",
};
const broker = {
  url: "https://connect.example",
  instanceId: "ada",
  secret: "s".repeat(40),
  returnUri: "https://brain.example/linkedin/oauth/broker/return",
};

async function installed(
  config: Record<string, unknown>,
  options: { executionOnly?: boolean } = {},
): Promise<{
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
  workspaces: Record<string, unknown>[];
}> {
  const shell = createMockShell();
  const workspaces: Record<string, unknown>[] = [];
  shell
    .getMessageBus()
    .subscribe<Record<string, unknown>, { workspaceUrl: string }>(
      "studio:register-workspace",
      async ({ payload }) => {
        workspaces.push({
          id: payload["id"],
          label: payload["label"],
          permission: payload["permission"],
          pluginId: payload["pluginId"],
        });
        return { success: true, data: { workspaceUrl: "/studio/linkedin" } };
      },
    );
  // Never reaches LinkedIn: nothing here starts a connection.
  const plugins = createLinkedInImportPlugins(config, {
    fetch: async () => {
      throw new Error("Unexpected fetch");
    },
  });
  const capabilities: PluginCapabilities[] = [];
  for (const plugin of plugins) {
    capabilities.push(
      await plugin.register(
        shell,
        options.executionOnly ? { executionOnly: true } : undefined,
      ),
    );
  }
  for (const plugin of plugins) await plugin.finalizeRegistration?.();
  return { shell, plugins, capabilities, workspaces };
}

function routes(plugins: Plugin[]): unknown[] {
  return plugins
    .flatMap((plugin) => plugin.getWebRoutes?.() ?? [])
    .map(({ handler: _handler, ...route }) => route);
}

/**
 * What the LinkedIn import registers, pinned as the linkedin-import plugin
 * class registered it: the Anchor's LinkedIn account settings, the OAuth
 * routes of its consent mode, and the LinkedIn workspace in Studio.
 */
describe("the LinkedIn import's registered surface", () => {
  it("is the linkedin-import service, with no tools, resources, instructions, API routes, jobs, templates, data sources or types", async () => {
    const { shell, plugins, capabilities } = await installed({ oauth });
    expect(
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]),
    ).toEqual([["linkedin-import", "service", "@brains/linkedin-import", []]]);
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

  it("registers nothing without a LinkedIn app or broker", async () => {
    const { shell, plugins, workspaces } = await installed({});
    expect(routes(plugins)).toEqual([]);
    expect(workspaces).toEqual([]);
    expect(shell.getAccountSettingsRegistry().listRegistrations()).toEqual([]);
  });

  it("keeps the Anchor's token in account settings it registers as the class did", async () => {
    const { shell } = await installed({ oauth });
    expect(
      shell
        .getAccountSettingsRegistry()
        .listRegistrations()
        .map(({ ownerPluginId, packageName, definitionId, definition }) => ({
          ownerPluginId,
          packageName,
          definitionId,
          title: definition.title,
          fields: definition.fields,
        })),
    ).toEqual([
      {
        ownerPluginId: "linkedin-import",
        packageName: "@brains/linkedin-import",
        definitionId: "linkedin",
        title: "LinkedIn",
        fields: {
          accessToken: { label: "Access token", secret: true },
          expiresAt: { label: "Expires (ISO date and time)" },
        },
      },
    ]);
  });

  it("serves its consent mode's two public routes, in every process", async () => {
    for (const executionOnly of [false, true]) {
      expect(
        routes((await installed({ oauth }, { executionOnly })).plugins),
      ).toEqual([
        { path: "/linkedin/oauth/start", method: "GET", public: true },
        { path: "/linkedin/oauth/callback", method: "GET", public: true },
      ]);
      expect(
        routes((await installed({ broker }, { executionOnly })).plugins),
      ).toEqual([
        { path: "/linkedin/oauth/start", method: "GET", public: true },
        { path: "/linkedin/oauth/broker/return", method: "GET", public: true },
      ]);
    }
  });

  it("registers the Anchor's LinkedIn workspace once registration completes, outside a worker", async () => {
    for (const config of [{ oauth }, { broker }]) {
      expect((await installed(config)).workspaces).toEqual([
        {
          id: "linkedin-import:linkedin",
          label: "LinkedIn",
          permission: "admin",
          pluginId: "linkedin-import",
        },
      ]);
      expect(
        (await installed(config, { executionOnly: true })).workspaces,
      ).toEqual([]);
    }
  });

  it("refuses both modes, and a callback or return address on another path", async () => {
    expect(installed({ oauth, broker })).rejects.toThrow(
      "linkedin-import: configure either oauth (direct) or broker, not both",
    );
    expect(
      installed({
        oauth: { ...oauth, redirectUri: "https://brain.example/elsewhere" },
      }),
    ).rejects.toThrow(
      "linkedin-import: oauth.redirectUri must end at /linkedin/oauth/callback",
    );
    expect(
      installed({
        broker: { ...broker, returnUri: "https://brain.example/elsewhere" },
      }),
    ).rejects.toThrow(
      "linkedin-import: broker.returnUri must end at /linkedin/oauth/broker/return",
    );
  });
});
