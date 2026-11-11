import { describe, expect, it } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import {
  dashboardWidgetRegisterContract,
  studioWorkspaceRegisterContract,
  type DashboardWidgetRegistration as WidgetRegistration,
  type StudioWorkspaceRegistration,
} from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import { createTempDir } from "@brains/test-utils";
import { createAdminPlugin } from "./admin-plugin";
import { adminActor } from "./studio-workspace-test-helpers";

/** A widget as the bus carries it: with the plugin that registered it. */
type DashboardWidgetRegistration = WidgetRegistration & { pluginId: string };

/**
 * What the admin package registers, pinned as the admin plugin class
 * registered it: Studio links and the Dashboard name its workspace, aliases
 * and widget by these ids.
 */
async function installed(
  options: { auth?: boolean; studio?: boolean; dashboard?: boolean } = {},
): Promise<{
  shell: MockShell;
  workspaces: StudioWorkspaceRegistration[];
  widgets: DashboardWidgetRegistration[];
}> {
  const shell = createMockShell({ domain: "brain.test" });
  if (options.auth !== false) {
    await new AuthServicePlugin({
      storageDir: await createTempDir("brains-admin-registration-"),
    }).register(shell);
  }
  const workspaces: StudioWorkspaceRegistration[] = [];
  const widgets: DashboardWidgetRegistration[] = [];
  if (options.studio !== false) {
    shell
      .getMessageBus()
      .subscribe<StudioWorkspaceRegistration, { workspaceUrl: string }>(
        studioWorkspaceRegisterContract.name,
        async (message) => {
          workspaces.push(message.payload);
          return {
            success: true,
            data: {
              workspaceUrl: `/studio/workspaces/${encodeURIComponent(message.payload.id)}`,
            },
          };
        },
      );
  }
  if (options.dashboard !== false) {
    shell
      .getMessageBus()
      .subscribe<DashboardWidgetRegistration>(
        dashboardWidgetRegisterContract.name,
        async (message) => {
          widgets.push(message.payload);
          return { success: true };
        },
      );
  }
  const plugin = createAdminPlugin();
  const capabilities = await plugin.register(shell);
  await plugin.finalizeRegistration?.();
  expect([plugin.id, plugin.type, plugin.packageName]).toEqual([
    "admin",
    "service",
    "@brains/admin",
  ]);
  expect(capabilities.tools).toEqual([]);
  expect(capabilities.resources).toEqual([]);
  expect(plugin.getWebRoutes?.() ?? []).toEqual([]);
  return { shell, workspaces, widgets };
}

describe("the admin package's registered surface", () => {
  it("registers one Administration workspace with its aliases", async () => {
    const { shell, workspaces } = await installed();
    expect(workspaces).toHaveLength(1);
    const workspace = workspaces[0];
    if (!workspace) throw new Error("Missing Administration workspace");
    expect({
      id: workspace.id,
      pluginId: workspace.pluginId,
      label: workspace.label,
      rendererName: workspace.rendererName,
      priority: workspace.priority,
      permission: workspace.permission,
      urlQuery: workspace.urlQuery,
      aliases: workspace.aliases,
      entityTypes: workspace.entityTypes,
      actions: typeof workspace.actionHandler,
      badge: typeof workspace.badgeProvider,
      access: typeof workspace.accessHandler,
    }).toEqual({
      id: "admin:administration",
      pluginId: "admin",
      label: "Administration",
      rendererName: "DeclarativeOperatorWorkspace",
      priority: 10,
      permission: "admin",
      urlQuery: true,
      aliases: [
        { id: "admin:people", query: { tab: "people" } },
        { id: "admin:invitations", query: { tab: "invitations" } },
        { id: "admin:peers", query: { tab: "people" } },
        { id: "admin:audit", query: { tab: "audit" } },
      ],
      entityTypes: [],
      actions: "function",
      badge: "function",
      access: "function",
    });
    expect(await workspace.badgeProvider?.(adminActor)).toBe(0);
    expect(
      shell.listEndpoints().filter((endpoint) => endpoint.pluginId === "admin"),
    ).toEqual([]);
    expect(
      shell
        .listInteractions()
        .filter((interaction) => interaction.pluginId === "admin"),
    ).toEqual([]);
    expect(shell.getJobQueueService().getRegisteredTypes()).toEqual([]);
  });

  it("registers the expiring-invitations widget for admins", async () => {
    const { widgets } = await installed();
    expect(
      widgets.map((widget) => ({
        id: widget.id,
        pluginId: widget.pluginId,
        title: widget.title,
        description: widget.description,
        group: widget.group,
        rendererName: widget.rendererName,
        section: widget.section,
        priority: widget.priority,
        visibility: widget.visibility,
      })),
    ).toEqual([
      {
        id: "expiring-invitations",
        pluginId: "admin",
        title: "Invitations",
        description: "Setup links that expire soon or need delivery attention",
        group: "access",
        rendererName: "DeclarativeOperatorWidget",
        section: "primary",
        priority: 5,
        visibility: "admin",
      },
    ]);
  });

  it("registers nothing for a host that is absent", async () => {
    const { workspaces, widgets } = await installed({
      studio: false,
      dashboard: false,
    });
    expect(workspaces).toEqual([]);
    expect(widgets).toEqual([]);
  });

  it("refuses to register its workspace without auth-service", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    shell
      .getMessageBus()
      .subscribe(studioWorkspaceRegisterContract.name, async () => ({
        success: true,
        data: { workspaceUrl: "/studio/workspaces/x" },
      }));
    const plugin = createAdminPlugin();
    await plugin.register(shell);
    const finalize = plugin.finalizeRegistration;
    if (!finalize)
      throw new Error("The admin plugin finalizes no registration");
    const failure = await finalize.call(plugin).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain(
      "Administration workspace requires auth-service",
    );
  });
});
