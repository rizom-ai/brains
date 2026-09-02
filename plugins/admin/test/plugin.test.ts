import { describe, expect, it } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import {
  STUDIO_OVERVIEW_REGISTER_MESSAGE,
  STUDIO_WORKSPACE_REGISTER_MESSAGE,
  type StudioOverviewContributionRegistration,
  type StudioWorkspaceRegistration,
} from "@brains/plugins";
import { createMockShell, createTempDir } from "@brains/test-utils";
import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import adminPackage from "../src";
import packageJson from "../package.json";

function adminPlugin(config: Record<string, unknown> = {}): Plugin {
  const metadata = { name: packageJson.name, version: packageJson.version };
  bindPluginPackageMetadata(adminPackage, metadata);
  const plugin = instantiatePluginPackageDefinition(
    adminPackage,
    config,
    metadata,
  )[0];
  if (!plugin) throw new Error("Admin plugin was not created");
  return plugin;
}

describe("administration workspace provider", () => {
  it("rejects retired browser-route configuration", () => {
    expect(() => adminPlugin({ routePath: "/admin" })).toThrow(
      /unrecognized key.*routePath/i,
    );
  });

  it("is headless and registers no independent console surface", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const plugin = adminPlugin();

    await plugin.register(shell);

    expect(plugin.getWebRoutes?.() ?? []).toEqual([]);
    expect(
      shell.listEndpoints().filter((endpoint) => endpoint.pluginId === "admin"),
    ).toEqual([]);
    expect(
      shell
        .listInteractions()
        .filter((interaction) => interaction.pluginId === "admin"),
    ).toEqual([]);
  });

  it("retains source ownership of one administration workspace", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const authPlugin = new AuthServicePlugin({
      storageDir: await createTempDir("brains-admin-workspace-provider-"),
    });
    await authPlugin.register(shell);
    const registrations: StudioWorkspaceRegistration[] = [];
    const overviewContributions: StudioOverviewContributionRegistration[] = [];
    shell
      .getMessageBus()
      .subscribe<StudioOverviewContributionRegistration>(
        STUDIO_OVERVIEW_REGISTER_MESSAGE,
        (message) => {
          overviewContributions.push(message.payload);
          return { success: true };
        },
      );
    shell
      .getMessageBus()
      .subscribe<StudioWorkspaceRegistration, { workspaceUrl: string }>(
        STUDIO_WORKSPACE_REGISTER_MESSAGE,
        async (message) => {
          registrations.push(message.payload);
          return {
            success: true,
            data: {
              workspaceUrl: `/studio/workspaces/${encodeURIComponent(message.payload.id)}`,
            },
          };
        },
      );
    const plugin = adminPlugin();

    await plugin.register(shell);
    await plugin.finalizeRegistration?.();

    expect(registrations).toHaveLength(1);
    expect(registrations[0]).toMatchObject({
      id: "@brains/admin:admin:administration",
      label: "Administration",
      permission: "admin",
      urlQuery: true,
      aliases: [
        { id: "@brains/admin:admin:people", query: { tab: "people" } },
        {
          id: "@brains/admin:admin:invitations",
          query: { tab: "invitations" },
        },
        { id: "@brains/admin:admin:peers", query: { tab: "people" } },
        { id: "@brains/admin:admin:audit", query: { tab: "audit" } },
      ],
    });
    expect(overviewContributions).toEqual([
      expect.objectContaining({
        id: "expiring-invitations",
        pluginId: "@brains/admin:admin",
        visibility: "admin",
      }),
    ]);
    const contribution = overviewContributions[0];
    if (!contribution) throw new Error("Missing invitations contribution");
    expect(
      await contribution.dataProvider({
        caller: {
          actor: { id: "admin-user" },
          permission: "admin",
          isAnchor: true,
        },
        signal: new AbortController().signal,
      }),
    ).toMatchObject({
      digest: { attention: 0 },
      view: {
        blocks: [
          { type: "stats" },
          { type: "list", items: [] },
          {
            type: "links",
            items: [
              {
                label: "Open Invitations",
                target: {
                  kind: "launch",
                  launch: { target: "invitations" },
                },
              },
            ],
          },
        ],
      },
    });
  });
});
