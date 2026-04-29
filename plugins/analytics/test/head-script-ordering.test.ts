import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AnalyticsPlugin } from "../src/index";

/**
 * Regression test: analytics plugin must inject its head script
 * regardless of plugin registration order.
 *
 * Fix: analytics sends from onReady, which runs after ALL plugins have
 * registered their message handlers.
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
    const analytics = new AnalyticsPlugin({
      cloudflare: {
        accountId: "abc",
        apiToken: "token",
        siteTag: "my-site-tag",
      },
    });
    await harness.installPlugin(analytics);

    // Subscribe AFTER plugin registered (late subscriber)
    let receivedPayload: { pluginId: string; script: string } | undefined;
    harness.subscribe(
      "plugin:site-builder:head-script:register",
      async (message: { payload: { pluginId: string; script: string } }) => {
        receivedPayload = message.payload;
        return { success: true };
      },
    );

    await analytics.ready();

    expect(receivedPayload).toBeDefined();
    expect(receivedPayload?.pluginId).toBe("analytics");
    expect(receivedPayload?.script).toContain("beacon.min.js");
    expect(receivedPayload?.script).toContain("my-site-tag");
  });

  it("should inject head script when site-builder subscribes BEFORE analytics registers", async () => {
    // Subscribe BEFORE plugin registered (early subscriber)
    let receivedPayload: { pluginId: string; script: string } | undefined;
    harness.subscribe(
      "plugin:site-builder:head-script:register",
      async (message: { payload: { pluginId: string; script: string } }) => {
        receivedPayload = message.payload;
        return { success: true };
      },
    );

    const analytics = new AnalyticsPlugin({
      cloudflare: {
        accountId: "abc",
        apiToken: "token",
        siteTag: "my-site-tag",
      },
    });
    await harness.installPlugin(analytics);

    await analytics.ready();

    expect(receivedPayload).toBeDefined();
    expect(receivedPayload?.pluginId).toBe("analytics");
    expect(receivedPayload?.script).toContain("beacon.min.js");
    expect(receivedPayload?.script).toContain("my-site-tag");
  });
});
