import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";

/**
 * Regression test for: Dashboard Widget Registration Timing
 *
 * Bug: Dashboard is empty because of a timing issue with inter-plugin messaging.
 * System/Analytics plugins send `dashboard:register-widget` messages in `onRegister()`,
 * but Dashboard initializes later (depends on site-builder). By the time Dashboard
 * subscribes, the messages have already been sent and lost.
 *
 * Fix: use an all-plugins-registered coordination signal. Producers wait until
 * every plugin has had a chance to subscribe before sending widget registrations.
 * Dashboard subscribes in `onRegister()` before the signal fires, so it receives
 * all messages. Public plugins should prefer `onReady`; this test documents the
 * lower-level message-bus coordination primitive.
 */

function createWidgetPayload(
  id: string,
  pluginId: string,
): Record<string, unknown> {
  return {
    id,
    pluginId,
    title: id,
    section: "primary",
    priority: 50,
    rendererName: "StatsWidget",
    dataProvider: async () => ({}),
  };
}

describe("Plugin Coordination: Dashboard Widget Registration Timing", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let registeredWidgets: Array<{ id: string; pluginId: string }>;

  beforeEach(() => {
    harness = createPluginHarness({
      dataDir: "/tmp/test-coordination",
    });
    registeredWidgets = [];
  });

  afterEach(() => {
    harness.reset();
  });

  function subscribeToWidgets(): void {
    harness.subscribe("dashboard:register-widget", (message) => {
      const payload = message.payload as { id: string; pluginId: string };
      registeredWidgets.push({ id: payload.id, pluginId: payload.pluginId });
      return { success: true };
    });
  }

  async function sendPluginsRegistered(): Promise<void> {
    await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {
      timestamp: new Date().toISOString(),
      pluginCount: 2,
    });
  }

  it("should demonstrate widget producer pattern: wait for all-registered signal before sending", async () => {
    let pluginsRegisteredReceived = false;
    let widgetSentTime = 0;
    let pluginsRegisteredTime = 0;

    harness.subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
      pluginsRegisteredTime = Date.now();
      pluginsRegisteredReceived = true;

      await harness.sendMessage(
        "dashboard:register-widget",
        createWidgetPayload("test-widget", "test-producer"),
      );
      widgetSentTime = Date.now();

      return { success: true };
    });

    subscribeToWidgets();

    expect(registeredWidgets).toHaveLength(0);

    await sendPluginsRegistered();

    expect(pluginsRegisteredReceived).toBe(true);
    expect(widgetSentTime).toBeGreaterThanOrEqual(pluginsRegisteredTime);
    expect(registeredWidgets).toContainEqual({
      id: "test-widget",
      pluginId: "test-producer",
    });
  });

  it("should demonstrate widget consumer pattern: subscribe in onRegister before all-registered signal", async () => {
    let consumerSubscribedTime = 0;
    let widgetReceivedTime = 0;

    consumerSubscribedTime = Date.now();
    harness.subscribe("dashboard:register-widget", (message) => {
      widgetReceivedTime = Date.now();
      const payload = message.payload as { id: string; pluginId: string };
      registeredWidgets.push({ id: payload.id, pluginId: payload.pluginId });
      return { success: true };
    });

    harness.subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
      await harness.sendMessage(
        "dashboard:register-widget",
        createWidgetPayload("delayed-widget", "test-producer"),
      );
      return { success: true };
    });

    expect(registeredWidgets).toHaveLength(0);

    await sendPluginsRegistered();

    expect(widgetReceivedTime).toBeGreaterThanOrEqual(consumerSubscribedTime);
    expect(registeredWidgets).toHaveLength(1);
  });

  it("should receive all widgets from a producer after all-registered signal", async () => {
    harness.subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
      await harness.sendMessage(
        "dashboard:register-widget",
        createWidgetPayload("entity-stats", "system"),
      );
      await harness.sendMessage("dashboard:register-widget", {
        ...createWidgetPayload("job-status", "system"),
        section: "secondary",
        priority: 20,
        rendererName: "ListWidget",
      });
      await harness.sendMessage("dashboard:register-widget", {
        ...createWidgetPayload("identity", "system"),
        section: "sidebar",
        priority: 5,
        rendererName: "CustomWidget",
      });
      return { success: true };
    });

    subscribeToWidgets();

    expect(registeredWidgets).toHaveLength(0);

    await sendPluginsRegistered();

    expect(registeredWidgets).toHaveLength(3);
    expect(registeredWidgets).toContainEqual({
      id: "entity-stats",
      pluginId: "system",
    });
    expect(registeredWidgets).toContainEqual({
      id: "job-status",
      pluginId: "system",
    });
    expect(registeredWidgets).toContainEqual({
      id: "identity",
      pluginId: "system",
    });
  });

  it("should NOT lose widgets due to timing when using all-registered coordination", async () => {
    subscribeToWidgets();

    harness.subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
      await harness.sendMessage(
        "dashboard:register-widget",
        createWidgetPayload("critical-widget", "system"),
      );
      return { success: true };
    });

    await sendPluginsRegistered();

    expect(registeredWidgets).toContainEqual({
      id: "critical-widget",
      pluginId: "system",
    });
  });
});
