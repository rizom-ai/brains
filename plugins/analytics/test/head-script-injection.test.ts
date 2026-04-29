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
    let receivedPayload: { pluginId: string; script: string } | undefined;
    harness.subscribe(
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
    await plugin.ready();

    expect(receivedPayload).toBeDefined();
    expect(receivedPayload?.pluginId).toBe("analytics");
    expect(receivedPayload?.script).toContain("beacon.min.js");
    expect(receivedPayload?.script).toContain("site-tag-123");
  });

  it("should NOT send head-script message when cloudflare is not configured", async () => {
    let receivedPayload: unknown;
    harness.subscribe(
      "plugin:site-builder:head-script:register",
      async (message: { payload: unknown }) => {
        receivedPayload = message.payload;
        return { success: true };
      },
    );

    const plugin = new AnalyticsPlugin({});
    await harness.installPlugin(plugin);
    await plugin.ready();

    expect(receivedPayload).toBeUndefined();
  });

  it("should NOT send head-script message when siteTag is empty", async () => {
    let receivedPayload: unknown;
    harness.subscribe(
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

    let installed = false;
    try {
      await harness.installPlugin(plugin);
      installed = true;
    } catch {
      // Config validation may reject empty siteTag
    }

    if (installed) {
      await plugin.ready();
    }

    expect(receivedPayload).toBeUndefined();
  });

  it("should generate correct Cloudflare beacon script", async () => {
    let receivedScript: string | undefined;
    harness.subscribe(
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
    await plugin.ready();

    expect(receivedScript).toBe(
      `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token":"my-site-tag"}'></script>`,
    );
  });
});
