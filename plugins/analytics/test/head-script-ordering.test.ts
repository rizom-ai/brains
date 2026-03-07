import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AnalyticsPlugin } from "../src/index";

/**
 * Regression test: analytics plugin must inject its head script
 * regardless of plugin registration order.
 *
 * In production, plugin array order determines registration order.
 * If analytics registers BEFORE site-builder, the head-script:register
 * message has no subscriber yet and the script is silently dropped.
 *
 * Fix: analytics defers sending until system:plugins:ready, which fires
 * after ALL plugins have registered their message handlers.
 */
describe("Analytics head script with plugin ordering", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({ dataDir: "/tmp/test-analytics-ordering" });
  });

  afterEach(() => {
    harness.reset();
  });

  it("should inject head script when site-builder subscribes AFTER analytics registers", async () => {
    const shell = harness.getShell();

    // Register analytics (no site-builder subscriber yet)
    const analytics = new AnalyticsPlugin({
      cloudflare: {
        accountId: "abc",
        apiToken: "token",
        siteTag: "my-site-tag",
      },
    });
    await harness.installPlugin(analytics);

    // Now simulate site-builder subscribing (happens when site-builder registers later)
    let receivedPayload: { pluginId: string; script: string } | undefined;
    shell
      .getMessageBus()
      .subscribe(
        "plugin:site-builder:head-script:register",
        async (message: { payload: { pluginId: string; script: string } }) => {
          receivedPayload = message.payload;
          return { success: true };
        },
      );

    // Fire system:plugins:ready — analytics should NOW send its message
    await shell.getMessageBus().send("system:plugins:ready", {}, "system");

    expect(receivedPayload).toBeDefined();
    expect(receivedPayload?.pluginId).toBe("analytics");
    expect(receivedPayload?.script).toContain("beacon.min.js");
    expect(receivedPayload?.script).toContain("my-site-tag");
  });

  it("should inject head script when site-builder subscribes BEFORE analytics registers", async () => {
    const shell = harness.getShell();

    // Site-builder subscribes first
    let receivedPayload: { pluginId: string; script: string } | undefined;
    shell
      .getMessageBus()
      .subscribe(
        "plugin:site-builder:head-script:register",
        async (message: { payload: { pluginId: string; script: string } }) => {
          receivedPayload = message.payload;
          return { success: true };
        },
      );

    // Register analytics second
    const analytics = new AnalyticsPlugin({
      cloudflare: {
        accountId: "abc",
        apiToken: "token",
        siteTag: "my-site-tag",
      },
    });
    await harness.installPlugin(analytics);

    // Fire system:plugins:ready
    await shell.getMessageBus().send("system:plugins:ready", {}, "system");

    expect(receivedPayload).toBeDefined();
    expect(receivedPayload?.pluginId).toBe("analytics");
    expect(receivedPayload?.script).toContain("beacon.min.js");
    expect(receivedPayload?.script).toContain("my-site-tag");
  });
});
