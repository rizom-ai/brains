import { createMockShell } from "@brains/plugins/test";
import { describe, expect, it } from "bun:test";
import { authServicePlugin } from "@brains/auth-service";
import {
  studioOverviewContributionRegisterContract,
  studioWorkspaceRegisterContract,
  type StudioOverviewContributionRegistration,
  type StudioWorkspaceRegistration,
} from "@brains/plugins";
import { createTempDir } from "@brains/test-utils";
import { createAdminPlugin } from "./admin-plugin";

describe("administration workspace provider", () => {
  it("rejects retired browser-route configuration", () => {
    expect(() => createAdminPlugin({ routePath: "/admin" })).toThrow(
      /unrecognized key.*routePath/i,
    );
  });

  it("is headless and registers no independent console surface", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const plugin = createAdminPlugin();

    await plugin.register(shell);

    expect(plugin.getWebRoutes?.()).toEqual([]);
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
    const authPlugin = authServicePlugin({
      storageDir: await createTempDir("brains-admin-workspace-provider-"),
    });
    await authPlugin.register(shell);
    const registrations: StudioWorkspaceRegistration[] = [];
    const overviewContributions: StudioOverviewContributionRegistration[] = [];
    shell
      .getMessageBus()
      .subscribe<StudioOverviewContributionRegistration>(
        studioOverviewContributionRegisterContract.name,
        (message) => {
          overviewContributions.push(message.payload);
          return { success: true };
        },
      );
    shell
      .getMessageBus()
      .subscribe<StudioWorkspaceRegistration, { workspaceUrl: string }>(
        studioWorkspaceRegisterContract.name,
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
    const plugin = createAdminPlugin();

    await plugin.register(shell);
    await plugin.finalizeRegistration?.();

    expect(registrations).toHaveLength(1);
    expect(registrations[0]).toMatchObject({
      id: "admin:administration",
      label: "Administration",
      permission: "admin",
      urlQuery: true,
      aliases: [
        { id: "admin:people", query: { tab: "people" } },
        { id: "admin:invitations", query: { tab: "invitations" } },
        { id: "admin:peers", query: { tab: "people" } },
        { id: "admin:audit", query: { tab: "audit" } },
      ],
    });
    expect(overviewContributions).toEqual([
      expect.objectContaining({
        id: "expiring-invitations",
        pluginId: "admin",
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
