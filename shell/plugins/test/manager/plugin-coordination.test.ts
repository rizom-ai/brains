import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";

/**
 * Regression test for: Dashboard Widget Registration Timing
 *
 * Bug: Dashboard is empty because of a timing issue with inter-plugin messaging.
 * System/Analytics plugins send `dashboard:register-widget` messages in `onRegister()`,
 * but Dashboard initializes later (depends on site-builder). By the time Dashboard
 * subscribes, the messages have already been sent and lost.
 *
 * Fix: Use the `system:plugins:ready` pattern. Producers wait for the ready signal
 * before sending widget registrations. Dashboard subscribes in `onRegister()` before
 * the ready signal fires, so it receives all messages.
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

  async function sendPluginsReady(): Promise<void> {
    await harness.sendMessage("system:plugins:ready", {
      timestamp: new Date().toISOString(),
      pluginCount: 2,
    });
  }

  it("should demonstrate widget producer pattern: wait for system:plugins:ready before sending", async () => {
    let systemPluginsReadyReceived = false;
    let widgetSentTime = 0;
    let readyReceivedTime = 0;

    harness.subscribe("system:plugins:ready", async () => {
      readyReceivedTime = Date.now();
      systemPluginsReadyReceived = true;

      await harness.sendMessage(
        "dashboard:register-widget",
        createWidgetPayload("test-widget", "test-producer"),
      );
      widgetSentTime = Date.now();

      return { success: true };
    });

    subscribeToWidgets();

    expect(registeredWidgets).toHaveLength(0);

    await sendPluginsReady();

    expect(systemPluginsReadyReceived).toBe(true);
    expect(widgetSentTime).toBeGreaterThanOrEqual(readyReceivedTime);
    expect(registeredWidgets).toContainEqual({
      id: "test-widget",
      pluginId: "test-producer",
    });
  });

  it("should demonstrate widget consumer pattern: subscribe in onRegister before system:plugins:ready", async () => {
    let consumerSubscribedTime = 0;
    let widgetReceivedTime = 0;

    consumerSubscribedTime = Date.now();
    harness.subscribe("dashboard:register-widget", (message) => {
      widgetReceivedTime = Date.now();
      const payload = message.payload as { id: string; pluginId: string };
      registeredWidgets.push({ id: payload.id, pluginId: payload.pluginId });
      return { success: true };
    });

    harness.subscribe("system:plugins:ready", async () => {
      await harness.sendMessage(
        "dashboard:register-widget",
        createWidgetPayload("delayed-widget", "test-producer"),
      );
      return { success: true };
    });

    expect(registeredWidgets).toHaveLength(0);

    await sendPluginsReady();

    expect(widgetReceivedTime).toBeGreaterThanOrEqual(consumerSubscribedTime);
    expect(registeredWidgets).toHaveLength(1);
  });

  it("should receive all widgets from a producer after system:plugins:ready", async () => {
    harness.subscribe("system:plugins:ready", async () => {
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

    await sendPluginsReady();

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

  it("should NOT lose widgets due to timing when using system:plugins:ready pattern", async () => {
    subscribeToWidgets();

    harness.subscribe("system:plugins:ready", async () => {
      await harness.sendMessage(
        "dashboard:register-widget",
        createWidgetPayload("critical-widget", "system"),
      );
      return { success: true };
    });

    await sendPluginsReady();

    expect(registeredWidgets).toContainEqual({
      id: "critical-widget",
      pluginId: "system",
    });
  });
});
