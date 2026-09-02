import { describe, expect, it } from "bun:test";
import { DASHBOARD_CHANNELS } from "@brains/contracts";
import {
  STUDIO_WORKSPACE_REGISTER_MESSAGE,
  InboxRegistry,
  type StudioWorkspaceRegistration,
  type DashboardWidgetRegistration,
  type InboxItem,
  type ServicePluginContext,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { InboxDataSource, inboxProjectionSchema } from "../src";
import { createUnifiedInboxPlugin } from "./install";

function item(
  id: string,
  urgency: "high" | "normal",
  receivedAt: string,
): InboxItem {
  return {
    id,
    title: `Attention ${id}`,
    receivedAt,
    urgency,
    actions: [{ id: "dismiss", label: "Dismiss" }],
  };
}

describe("InboxDataSource", () => {
  it("aggregates all sources by urgency then recency", async () => {
    const registry = new InboxRegistry();
    registry.registerSource("alpha-plugin", {
      sourceId: "alpha",
      displayName: "Alpha",
      list: async () => [
        item("alpha-normal", "normal", "2026-08-04T12:00:00.000Z"),
        item("alpha-high", "high", "2026-08-04T08:00:00.000Z"),
      ],
      act: async () => undefined,
    });
    registry.registerSource("beta-plugin", {
      sourceId: "beta",
      displayName: "Beta",
      list: async () => [item("beta-high", "high", "2026-08-04T10:00:00.000Z")],
      act: async () => undefined,
    });
    registry.finalize();

    const projection = inboxProjectionSchema.parse(
      await new InboxDataSource(registry).getInboxData(),
    );

    expect(projection.entries.map((entry) => entry.item.id)).toEqual([
      "beta-high",
      "alpha-high",
      "alpha-normal",
    ]);
    expect(projection.entries.map((entry) => entry.source.sourceId)).toEqual([
      "beta",
      "alpha",
      "alpha",
    ]);
    expect(projection.errors).toEqual([]);
  });

  it("isolates a failing source without exposing its exception", async () => {
    const registry = new InboxRegistry();
    registry.registerSource("healthy-plugin", {
      sourceId: "healthy",
      displayName: "Healthy",
      list: async () => [
        item("healthy-1", "normal", "2026-08-04T09:00:00.000Z"),
      ],
      act: async () => undefined,
    });
    registry.registerSource("failing-plugin", {
      sourceId: "failing",
      displayName: "Failing",
      list: async () => {
        throw new Error("private source failure");
      },
      act: async () => undefined,
    });
    registry.finalize();

    const projection = await new InboxDataSource(registry).getInboxData();

    expect(projection.entries.map((entry) => entry.item.id)).toEqual([
      "healthy-1",
    ]);
    expect(projection.errors).toEqual([
      {
        source: { sourceId: "failing", displayName: "Failing" },
        error: "Source unavailable",
      },
    ]);
    expect(JSON.stringify(projection)).not.toContain("private source failure");
  });

  it("coalesces concurrent projections into one source fan-out", async () => {
    let lists = 0;
    const registry = new InboxRegistry();
    registry.registerSource("alpha-plugin", {
      sourceId: "alpha",
      displayName: "Alpha",
      list: async () => {
        lists += 1;
        return [item("alpha-high", "high", "2026-08-04T08:00:00.000Z")];
      },
      act: async () => undefined,
    });
    registry.finalize();
    const dataSource = new InboxDataSource(registry);

    const [first, second] = await Promise.all([
      dataSource.getInboxData(),
      dataSource.getInboxData(),
    ]);

    expect(lists).toBe(1);
    expect(first).toBe(second);

    await dataSource.getInboxData();
    expect(lists).toBe(2);
  });

  it("returns a stable empty projection", async () => {
    const registry = new InboxRegistry();
    registry.finalize();

    expect(await new InboxDataSource(registry).getInboxData()).toEqual({
      entries: [],
      errors: [],
    });
  });

  it("registers the digest execution dependency before worker ready hooks", async () => {
    const harness = createPluginHarness({
      domain: "brain.test",
      logContext: "unified-inbox-worker-registration-test",
    });
    const shell = harness.getMockShell();
    let check:
      | Parameters<ServicePluginContext["recurringChecks"]["register"]>[0]
      | undefined;
    shell.getRecurringChecks = (): ReturnType<
      typeof shell.getRecurringChecks
    > => ({
      register: (definition): (() => void) => {
        check = definition;
        return (): void => undefined;
      },
    });

    const plugin = createUnifiedInboxPlugin();
    await plugin.register(shell, { executionOnly: true });

    expect(check).toMatchObject({
      id: "daily-digest",
      cadence: "daily",
      includeInInbox: false,
    });
    harness.reset();
  });

  it("keeps Dashboard semantic while handing the Studio destination to interactions and digest", async () => {
    const harness = createPluginHarness({
      domain: "brain.test",
      logContext: "unified-inbox-order-test",
    });
    const shell = harness.getMockShell();
    const events: string[] = [];
    let widget: DashboardWidgetRegistration | undefined;
    let check:
      | Parameters<ServicePluginContext["recurringChecks"]["register"]>[0]
      | undefined;
    shell
      .getMessageBus()
      .subscribe<StudioWorkspaceRegistration, { workspaceUrl: string }>(
        STUDIO_WORKSPACE_REGISTER_MESSAGE,
        async () => {
          events.push("workspace");
          return {
            success: true,
            data: { workspaceUrl: "/studio/workspaces/inbox" },
          };
        },
      );
    shell
      .getMessageBus()
      .subscribe<DashboardWidgetRegistration>(
        DASHBOARD_CHANNELS.registerWidget,
        async (message) => {
          events.push("dashboard");
          widget = message.payload;
          return { success: true };
        },
      );
    shell.getRecurringChecks = (): ReturnType<
      typeof shell.getRecurringChecks
    > => ({
      register: (definition): (() => void) => {
        events.push("digest");
        check = definition;
        return (): void => undefined;
      },
    });
    shell.getInboxRegistry().registerSource("mail-plugin", {
      sourceId: "mail-items",
      displayName: "Email Triage",
      list: async () => [item("mail-high", "high", "2026-08-04T10:00:00.000Z")],
      act: async () => undefined,
    });

    const plugin = createUnifiedInboxPlugin();
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    await plugin.ready?.();

    expect(events).toEqual(["digest", "workspace", "dashboard"]);
    if (!widget || !check)
      throw new Error("Operator surfaces did not register");
    expect((await shell.getAppInfo()).interactions).toContainEqual({
      id: "unified-inbox",
      label: "Inbox",
      description: "Review source-owned items that need operator attention.",
      href: "/studio/workspaces/inbox",
      kind: "admin",
      pluginId: "@brains/unified-inbox:unified-inbox",
      priority: 20,
      visibility: "admin",
      status: "available",
    });
    const dashboardData = await widget.dataProvider({
      caller: {
        actor: { id: "user:admin" },
        permission: "admin",
        isAnchor: true,
      },
      signal: new AbortController().signal,
    });
    if (
      dashboardData === null ||
      typeof dashboardData !== "object" ||
      !("view" in dashboardData) ||
      dashboardData.view === null ||
      typeof dashboardData.view !== "object" ||
      !("blocks" in dashboardData.view) ||
      !Array.isArray(dashboardData.view.blocks)
    ) {
      throw new Error("Expected normalized Inbox dashboard data");
    }
    const launch = dashboardData.view.blocks.find(
      (block) =>
        block !== null &&
        typeof block === "object" &&
        "type" in block &&
        block.type === "links",
    );
    expect(launch).toEqual({
      type: "links",
      items: [
        {
          label: "Open Inbox",
          target: {
            kind: "launch",
            launch: { target: "inbox" },
          },
        },
      ],
    });
    expect(JSON.stringify(dashboardData)).not.toContain(
      "/studio/workspaces/inbox",
    );
    const digest = await check.run({ signal: new AbortController().signal });
    expect(digest.alerts?.[0]?.body).toContain(
      "Open Inbox: https://brain.test/studio/workspaces/inbox",
    );
  });

  it("does not advertise or forward an invalid Studio workspace target", async () => {
    const harness = createPluginHarness({
      logContext: "unified-inbox-invalid-target-test",
    });
    const shell = harness.getMockShell();
    let widget: DashboardWidgetRegistration | undefined;
    shell
      .getMessageBus()
      .subscribe<StudioWorkspaceRegistration, { workspaceUrl: string }>(
        STUDIO_WORKSPACE_REGISTER_MESSAGE,
        async () => ({
          success: true,
          data: { workspaceUrl: "https://evil.test/inbox" },
        }),
      );
    shell
      .getMessageBus()
      .subscribe<DashboardWidgetRegistration>(
        DASHBOARD_CHANNELS.registerWidget,
        async (message) => {
          widget = message.payload;
          return { success: true };
        },
      );

    const plugin = createUnifiedInboxPlugin();
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    await plugin.ready?.();

    expect((await shell.getAppInfo()).interactions).not.toContainEqual(
      expect.objectContaining({ id: "unified-inbox" }),
    );
    if (!widget) throw new Error("Inbox widget was not registered");
    const dashboardData = await widget.dataProvider({
      caller: {
        actor: { id: "user:admin" },
        permission: "admin",
        isAnchor: true,
      },
      signal: new AbortController().signal,
    });
    expect(JSON.stringify(dashboardData)).not.toContain("evil.test");
    expect(dashboardData).not.toHaveProperty("managementUrl");
  });

  it("answers the headless tool without webserver, Studio, or Dashboard plugins", async () => {
    const harness = createPluginHarness({
      logContext: "unified-inbox-test",
    });
    harness
      .getMockShell()
      .getInboxRegistry()
      .registerSource("mail-plugin", {
        sourceId: "mail-items",
        displayName: "Email Triage",
        list: async () => [
          item("mail-high", "high", "2026-08-04T10:00:00.000Z"),
        ],
        act: async () => undefined,
      });
    const plugin = createUnifiedInboxPlugin();
    const capabilities = await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    await plugin.ready?.();

    expect(
      harness
        .getMockShell()
        .getDataSourceRegistry()
        .has("@brains/unified-inbox:inbox"),
    ).toBe(true);
    expect(harness.getMockShell().hasPlugin("webserver")).toBe(false);
    expect(harness.getMockShell().hasPlugin("studio")).toBe(false);
    expect(harness.getMockShell().hasPlugin("dashboard")).toBe(false);
    expect(
      (await harness.getMockShell().getAppInfo()).interactions,
    ).not.toContainEqual(expect.objectContaining({ id: "unified-inbox" }));
    expect(capabilities.tools.map((tool) => tool.name)).toEqual([
      "unified-inbox_list",
    ]);
    expect(await harness.executeTool("unified-inbox_list", {})).toMatchObject({
      success: true,
      data: {
        total: 1,
        entries: [{ item: { title: "Attention mail-high" } }],
      },
    });
    expect(plugin.getWebRoutes?.()).toEqual([]);
  });
});
