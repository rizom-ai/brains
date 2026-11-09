import { describe, expect, it } from "bun:test";
import {
  dashboardWidgetRegisterContract,
  studioWorkspaceRegisterContract,
  type DashboardWidgetRegistration as WidgetRegistration,
  type ServicePluginContext,
  type StudioWorkspaceRegistration,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createUnifiedInboxPlugin } from "./unified-inbox-plugin";

/** A widget as the bus carries it: with the plugin that registered it. */
type DashboardWidgetRegistration = WidgetRegistration & { pluginId: string };
type CheckDefinition = Parameters<
  ServicePluginContext["recurringChecks"]["register"]
>[0];

/**
 * What the unified inbox package registers, pinned as the unified inbox
 * plugin class registered it: Studio links, the contact plugin's alerts,
 * agents and the daily digest name these by string.
 */
async function installed(
  options: { hosts?: boolean; executionOnly?: boolean } = {},
): Promise<{
  harness: ReturnType<typeof createPluginHarness>;
  tools: Awaited<
    ReturnType<ReturnType<typeof createPluginHarness>["installPlugin"]>
  >["tools"];
  workspaces: StudioWorkspaceRegistration[];
  unregistered: unknown[];
  widgets: DashboardWidgetRegistration[];
  checks: CheckDefinition[];
}> {
  const harness = createPluginHarness({
    domain: "brain.test",
    logContext: "unified-inbox-registration-test",
  });
  const shell = harness.getMockShell();
  const workspaces: StudioWorkspaceRegistration[] = [];
  const unregistered: unknown[] = [];
  const widgets: DashboardWidgetRegistration[] = [];
  const checks: CheckDefinition[] = [];
  if (options.hosts !== false) {
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
    shell
      .getMessageBus()
      .subscribe("studio:unregister-workspace", async (message) => {
        unregistered.push(message.payload);
        return { success: true };
      });
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
  shell.getRecurringChecks = (): ReturnType<
    typeof shell.getRecurringChecks
  > => ({
    register: (definition): (() => void) => {
      checks.push(definition);
      return (): void => undefined;
    },
  });
  const plugin = createUnifiedInboxPlugin();
  if (options.executionOnly) {
    await plugin.register(shell, { executionOnly: true });
    return { harness, tools: [], workspaces, unregistered, widgets, checks };
  }
  const capabilities = await harness.installPlugin(plugin);
  await harness.finalizeRegistration();
  await plugin.ready?.();
  expect([plugin.id, plugin.type, plugin.packageName]).toEqual([
    "unified-inbox",
    "service",
    "@brains/unified-inbox",
  ]);
  expect(capabilities.resources).toEqual([]);
  expect(plugin.getWebRoutes?.() ?? []).toEqual([]);
  return {
    harness,
    tools: capabilities.tools,
    workspaces,
    unregistered,
    widgets,
    checks,
  };
}

describe("the unified inbox package's registered surface", () => {
  it("registers inbox_list for admins", async () => {
    const { tools } = await installed();
    expect(
      tools.map((tool) => ({
        name: tool.name,
        visibility: tool.visibility,
        sideEffects: tool.sideEffects,
        input: Object.keys(tool.inputSchema).sort(),
      })),
    ).toEqual([
      {
        name: "inbox_list",
        visibility: "admin",
        sideEffects: "none",
        input: ["facets", "limit", "sourceId", "urgency"],
      },
    ]);
  });

  it("registers the Inbox workspace, its widget, its digest and its way in", async () => {
    const { harness, workspaces, widgets, checks } = await installed();
    expect(
      workspaces.map((workspace) => ({
        id: workspace.id,
        pluginId: workspace.pluginId,
        label: workspace.label,
        rendererName: workspace.rendererName,
        priority: workspace.priority,
        permission: workspace.permission,
        urlQuery: workspace.urlQuery,
        aliases: workspace.aliases,
        actions: typeof workspace.actionHandler,
        badge: typeof workspace.badgeProvider,
      })),
    ).toEqual([
      {
        id: "unified-inbox:inbox",
        pluginId: "unified-inbox",
        label: "Inbox",
        rendererName: "DeclarativeOperatorWorkspace",
        priority: 20,
        permission: "admin",
        urlQuery: true,
        aliases: undefined,
        actions: "function",
        badge: "function",
      },
    ]);
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
        id: "inbox",
        pluginId: "unified-inbox",
        title: "Inbox",
        description: "Live attention across source-owned workflows",
        group: "communication",
        rendererName: "DeclarativeOperatorWidget",
        section: "primary",
        priority: 10,
        visibility: "admin",
      },
    ]);
    expect(
      checks.map(({ id, cadence, includeInInbox }) => ({
        id,
        cadence,
        includeInInbox,
      })),
    ).toEqual([
      { id: "daily-digest", cadence: "daily", includeInInbox: false },
    ]);
    const shell = harness.getMockShell();
    expect(
      (await shell.getAppInfo()).interactions.filter(
        (interaction) => interaction.pluginId === "unified-inbox",
      ),
    ).toEqual([
      {
        id: "unified-inbox",
        label: "Inbox",
        description: "Review source-owned items that need operator attention.",
        href: "/studio/workspaces/unified-inbox%3Ainbox",
        kind: "admin",
        pluginId: "unified-inbox",
        priority: 20,
        visibility: "admin",
        status: "available",
      },
    ]);
    expect(shell.getJobQueueService().getRegisteredTypes()).toEqual([]);
  });

  it("points the digest at the workspace Studio serves it at", async () => {
    const { checks } = await installed();
    const [check] = checks;
    if (!check) throw new Error("No digest");
    // Nothing needs attention, so the digest stays quiet.
    expect(await check.run({ signal: new AbortController().signal })).toEqual({
      alerts: [],
    });
  });

  it("unregisters its workspace when it shuts down", async () => {
    const { harness, unregistered } = await installed();
    await harness.getPlugin().shutdown?.();
    expect(unregistered).toEqual([
      { pluginId: "unified-inbox", workspaceId: "unified-inbox:inbox" },
    ]);
  });

  it("registers no workspace, widget or way in without the hosts", async () => {
    const { harness, workspaces, widgets, checks } = await installed({
      hosts: false,
    });
    expect(workspaces).toEqual([]);
    expect(widgets).toEqual([]);
    expect(checks).toHaveLength(1);
    expect(
      (await harness.getMockShell().getAppInfo()).interactions.filter(
        (interaction) => interaction.pluginId === "unified-inbox",
      ),
    ).toEqual([]);
  });

  it("registers its digest in a worker, and nothing else", async () => {
    const { workspaces, widgets, checks } = await installed({
      executionOnly: true,
    });
    expect(checks.map(({ id }) => id)).toEqual(["daily-digest"]);
    expect(workspaces).toEqual([]);
    expect(widgets).toEqual([]);
  });
});
