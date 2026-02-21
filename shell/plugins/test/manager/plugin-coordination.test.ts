import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";

/**
 * Regression test for: Dashboard Widget Registration Timing
 *
 * Bug: Dashboard is empty because of a timing issue with inter-plugin messaging:
 * 1. System/Analytics plugins send `dashboard:register-widget` messages in `onRegister()`
 * 2. Dashboard plugin depends on site-builder -> initializes LATER
 * 3. By the time Dashboard subscribes to widget messages, System/Analytics have already sent theirs
 * 4. Messages sent before a subscriber exists are lost
 *
 * Fix: Use the `system:plugins:ready` pattern:
 * 1. Dashboard subscribes to widget messages in `onRegister()` (before `system:plugins:ready`)
 * 2. System/Analytics subscribe to `system:plugins:ready` in `onRegister()`,
 *    then send widget registrations in that callback
 * 3. When `system:plugins:ready` fires, Dashboard is already listening -> messages received
 *
 * Timeline:
 * 1. System plugin initializes -> subscribes to "system:plugins:ready"
 * 2. Analytics plugin initializes -> subscribes to "system:plugins:ready"
 * 3. site-builder initializes
 * 4. Dashboard plugin initializes -> subscribes to "dashboard:register-widget"
 * 5. Shell emits "system:plugins:ready"
 * 6. System/Analytics callbacks fire -> send widget messages
 * 7. Dashboard receives widget messages
 */
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

  it("should demonstrate widget producer pattern: wait for system:plugins:ready before sending", async () => {
    // Simulate a widget producer plugin that follows the correct pattern
    let systemPluginsReadyReceived = false;
    let widgetSentTime = 0;
    let readyReceivedTime = 0;

    // Subscribe to system:plugins:ready (like System/Analytics plugins do)
    harness.subscribe("system:plugins:ready", async () => {
      readyReceivedTime = Date.now();
      systemPluginsReadyReceived = true;

      // Send widget registration AFTER receiving system:plugins:ready
      await harness.sendMessage("dashboard:register-widget", {
        id: "test-widget",
        pluginId: "test-producer",
        title: "Test Widget",
        section: "primary",
        priority: 50,
        rendererName: "StatsWidget",
        dataProvider: async () => ({ value: 42 }),
      });
      widgetSentTime = Date.now();

      return { success: true };
    });

    // Simulate Dashboard subscribing to widget messages
    harness.subscribe("dashboard:register-widget", (message) => {
      const payload = message.payload as { id: string; pluginId: string };
      registeredWidgets.push({ id: payload.id, pluginId: payload.pluginId });
      return { success: true };
    });

    // No widgets should be registered yet
    expect(registeredWidgets).toHaveLength(0);

    // Emit system:plugins:ready (like Shell does after all plugins initialize)
    await harness.sendMessage("system:plugins:ready", {
      timestamp: new Date().toISOString(),
      pluginCount: 2,
    });

    // Verify the correct sequence occurred
    expect(systemPluginsReadyReceived).toBe(true);
    expect(widgetSentTime).toBeGreaterThanOrEqual(readyReceivedTime);
    expect(registeredWidgets).toContainEqual({
      id: "test-widget",
      pluginId: "test-producer",
    });
  });

  it("should demonstrate widget consumer pattern: subscribe in onRegister before system:plugins:ready", async () => {
    // Track when consumer subscription was set up vs when widgets arrived
    let consumerSubscribedTime = 0;
    let widgetReceivedTime = 0;

    // Consumer subscribes early (simulating Dashboard in onRegister)
    consumerSubscribedTime = Date.now();
    harness.subscribe("dashboard:register-widget", (message) => {
      widgetReceivedTime = Date.now();
      const payload = message.payload as { id: string; pluginId: string };
      registeredWidgets.push({ id: payload.id, pluginId: payload.pluginId });
      return { success: true };
    });

    // Producer waits for system:plugins:ready (simulating System/Analytics)
    harness.subscribe("system:plugins:ready", async () => {
      await harness.sendMessage("dashboard:register-widget", {
        id: "delayed-widget",
        pluginId: "test-producer",
        title: "Delayed Widget",
        section: "primary",
        priority: 50,
        rendererName: "StatsWidget",
        dataProvider: async () => ({}),
      });
      return { success: true };
    });

    // No widgets registered before system:plugins:ready
    expect(registeredWidgets).toHaveLength(0);

    // Trigger system:plugins:ready
    await harness.sendMessage("system:plugins:ready", {
      timestamp: new Date().toISOString(),
      pluginCount: 2,
    });

    // Widget should be received AFTER consumer subscribed
    expect(widgetReceivedTime).toBeGreaterThanOrEqual(consumerSubscribedTime);
    expect(registeredWidgets).toHaveLength(1);
  });

  it("should receive all widgets from a producer after system:plugins:ready", async () => {
    // Producer (like System plugin) subscribes to system:plugins:ready
    // and sends multiple widgets in its callback
    harness.subscribe("system:plugins:ready", async () => {
      // System plugin sends its widgets
      await harness.sendMessage("dashboard:register-widget", {
        id: "entity-stats",
        pluginId: "system",
        title: "Entity Statistics",
        section: "primary",
        priority: 10,
        rendererName: "StatsWidget",
        dataProvider: async () => ({}),
      });
      await harness.sendMessage("dashboard:register-widget", {
        id: "job-status",
        pluginId: "system",
        title: "Active Jobs",
        section: "secondary",
        priority: 20,
        rendererName: "ListWidget",
        dataProvider: async () => ({}),
      });
      await harness.sendMessage("dashboard:register-widget", {
        id: "identity",
        pluginId: "system",
        title: "Brain Identity",
        section: "sidebar",
        priority: 5,
        rendererName: "CustomWidget",
        dataProvider: async () => ({}),
      });
      return { success: true };
    });

    // Consumer (Dashboard) subscribes before system:plugins:ready
    harness.subscribe("dashboard:register-widget", (message) => {
      const payload = message.payload as { id: string; pluginId: string };
      registeredWidgets.push({ id: payload.id, pluginId: payload.pluginId });
      return { success: true };
    });

    // No widgets before ready signal
    expect(registeredWidgets).toHaveLength(0);

    // Trigger system:plugins:ready
    await harness.sendMessage("system:plugins:ready", {
      timestamp: new Date().toISOString(),
      pluginCount: 2,
    });

    // All widgets should be registered
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
    // This test demonstrates the FIXED behavior.
    // Previously, widgets sent in onRegister() were lost because
    // Dashboard wasn't subscribed yet.

    // Consumer sets up subscription (simulating Dashboard.onRegister)
    harness.subscribe("dashboard:register-widget", (message) => {
      const payload = message.payload as { id: string; pluginId: string };
      registeredWidgets.push({ id: payload.id, pluginId: payload.pluginId });
      return { success: true };
    });

    // Producer waits for system:plugins:ready (simulating System.onRegister)
    harness.subscribe("system:plugins:ready", async () => {
      await harness.sendMessage("dashboard:register-widget", {
        id: "critical-widget",
        pluginId: "system",
        title: "Critical Widget",
        section: "primary",
        priority: 1,
        rendererName: "StatsWidget",
        dataProvider: async () => ({}),
      });
      return { success: true };
    });

    // Shell emits system:plugins:ready after all plugins registered
    await harness.sendMessage("system:plugins:ready", {
      timestamp: new Date().toISOString(),
      pluginCount: 2,
    });

    // The critical assertion: widget was NOT lost
    expect(registeredWidgets).toContainEqual({
      id: "critical-widget",
      pluginId: "system",
    });
  });
});
