import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AnalyticsPlugin } from "../src/index";

describe("Analytics head script injection", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness();
  });

  afterEach(() => {
    harness.reset();
  });

  it("should send head-script registration message when siteTag is configured", async () => {
    const shell = harness.getShell();

    // Subscribe to the head-script registration message BEFORE installing the plugin
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

    const plugin = new AnalyticsPlugin({
      cloudflare: {
        accountId: "abc123",
        apiToken: "cf_token",
        siteTag: "site-tag-123",
      },
    });

    await harness.installPlugin(plugin);

    // Analytics defers sending until system:plugins:ready
    await shell.getMessageBus().send("system:plugins:ready", {}, "system");

    expect(receivedPayload).toBeDefined();
    expect(receivedPayload?.pluginId).toBe("analytics");
    expect(receivedPayload?.script).toContain("beacon.min.js");
    expect(receivedPayload?.script).toContain("site-tag-123");
  });

  it("should NOT send head-script message when cloudflare is not configured", async () => {
    const shell = harness.getShell();

    let receivedPayload: unknown;
    shell
      .getMessageBus()
      .subscribe(
        "plugin:site-builder:head-script:register",
        async (message: { payload: unknown }) => {
          receivedPayload = message.payload;
          return { success: true };
        },
      );

    const plugin = new AnalyticsPlugin({});
    await harness.installPlugin(plugin);

    // Even after plugins:ready, no message should be sent
    await shell.getMessageBus().send("system:plugins:ready", {}, "system");

    expect(receivedPayload).toBeUndefined();
  });

  it("should NOT send head-script message when siteTag is empty", async () => {
    const shell = harness.getShell();

    let receivedPayload: unknown;
    shell
      .getMessageBus()
      .subscribe(
        "plugin:site-builder:head-script:register",
        async (message: { payload: unknown }) => {
          receivedPayload = message.payload;
          return { success: true };
        },
      );

    const plugin = new AnalyticsPlugin({
      cloudflare: {
        accountId: "abc123",
        apiToken: "cf_token",
        siteTag: "",
      },
    });

    // siteTag is empty string — schema may reject it, or onRegister skips
    try {
      await harness.installPlugin(plugin);
    } catch {
      // Config validation may reject empty siteTag — that's fine
    }

    // Even after plugins:ready, no message should be sent
    await shell.getMessageBus().send("system:plugins:ready", {}, "system");

    expect(receivedPayload).toBeUndefined();
  });

  it("should generate correct Cloudflare beacon script", async () => {
    const shell = harness.getShell();

    let receivedScript: string | undefined;
    shell
      .getMessageBus()
      .subscribe(
        "plugin:site-builder:head-script:register",
        async (message: { payload: { script: string } }) => {
          receivedScript = message.payload.script;
          return { success: true };
        },
      );

    const plugin = new AnalyticsPlugin({
      cloudflare: {
        accountId: "abc123",
        apiToken: "cf_token",
        siteTag: "my-site-tag",
      },
    });

    await harness.installPlugin(plugin);

    // Analytics defers sending until system:plugins:ready
    await shell.getMessageBus().send("system:plugins:ready", {}, "system");

    expect(receivedScript).toBe(
      `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token":"my-site-tag"}'></script>`,
    );
  });
});
