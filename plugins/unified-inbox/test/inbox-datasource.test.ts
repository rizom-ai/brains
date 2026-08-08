import { describe, expect, it } from "bun:test";
import { DASHBOARD_CHANNELS } from "@brains/contracts";
import {
  CMS_WORKSPACE_REGISTER_MESSAGE,
  InboxRegistry,
  type CmsWorkspaceRegistration,
  type DashboardWidgetRegistration,
  type InboxItem,
  type ServicePluginContext,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import {
  InboxDataSource,
  UnifiedInboxPlugin,
  inboxProjectionSchema,
} from "../src";

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

  it("returns a stable empty projection", async () => {
    const registry = new InboxRegistry();
    registry.finalize();

    expect(await new InboxDataSource(registry).getInboxData()).toEqual({
      entries: [],
      errors: [],
    });
  });

  it("hands the custom CMS destination to Dashboard and digest in order", async () => {
    const harness = createPluginHarness<UnifiedInboxPlugin>({
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
      .subscribe<CmsWorkspaceRegistration, { workspaceUrl: string }>(
        CMS_WORKSPACE_REGISTER_MESSAGE,
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

    const plugin = new UnifiedInboxPlugin();
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    await plugin.ready();

    expect(events).toEqual(["workspace", "dashboard", "digest"]);
    if (!widget || !check)
      throw new Error("Operator surfaces did not register");
    expect(await widget.dataProvider()).toMatchObject({
      managementUrl: "/studio/workspaces/inbox",
    });
    const digest = await check.run({ signal: new AbortController().signal });
    expect(digest.alerts?.[0]?.body).toContain(
      "Open Inbox: https://brain.test/studio/workspaces/inbox",
    );
  });

  it("registers the DataSource, tool, and route-free widget lifecycle", async () => {
    const harness = createPluginHarness<UnifiedInboxPlugin>({
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
    const plugin = new UnifiedInboxPlugin();
    const capabilities = await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    await plugin.ready();

    expect(
      harness.getMockShell().getDataSourceRegistry().has("unified-inbox:inbox"),
    ).toBe(true);
    expect(capabilities.tools.map((tool) => tool.name)).toEqual(["inbox_list"]);
    expect(await harness.executeTool("inbox_list", {})).toMatchObject({
      success: true,
      data: { total: 1, entries: [{ item: { id: "mail-high" } }] },
    });
    expect(plugin.getWebRoutes()).toEqual([]);
  });
});
