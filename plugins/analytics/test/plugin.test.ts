import { describe, it, expect, beforeEach } from "bun:test";
import type { AnalyticsPlugin } from "../src/index";
import {
  createAnalyticsPlugin,
  AnalyticsPlugin as AnalyticsPluginClass,
} from "../src/index";
import { createCorePluginHarness } from "@brains/plugins/test";

describe("AnalyticsPlugin", () => {
  let plugin: AnalyticsPlugin;

  beforeEach(() => {
    plugin = createAnalyticsPlugin({
      cloudflare: {
        accountId: "abc123",
        apiToken: "cf_test_token",
        siteTag: "site123",
      },
    }) as AnalyticsPlugin;
  });

  describe("Plugin Configuration", () => {
    it("should have correct plugin metadata", () => {
      expect(plugin.id).toBe("analytics");
      expect(plugin.description).toContain("Analytics");
      expect(plugin.version).toBe("0.1.0");
    });

    it("should use default configuration when not provided", () => {
      const defaultPlugin = createAnalyticsPlugin() as AnalyticsPlugin;
      expect(defaultPlugin.id).toBe("analytics");
      expect(defaultPlugin.version).toBe("0.1.0");
    });

    it("should accept custom configuration", () => {
      const customPlugin = createAnalyticsPlugin({
        cloudflare: {
          accountId: "custom",
          apiToken: "cf_custom",
          siteTag: "custom_site",
        },
      }) as AnalyticsPlugin;

      expect(customPlugin.id).toBe("analytics");
      expect(customPlugin.version).toBe("0.1.0");
    });
  });

  describe("Plugin Tools", () => {
    it("should register analytics_query tool when cloudflare is configured", async () => {
      const harness = createCorePluginHarness();

      const capabilities = await harness.installPlugin(
        new AnalyticsPluginClass({
          cloudflare: {
            accountId: "abc123",
            apiToken: "cf_test_token",
            siteTag: "site123",
          },
        }),
      );

      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("analytics_query");
      harness.reset();
    });

    it("should NOT register tools when cloudflare is not configured", async () => {
      const harness = createCorePluginHarness();

      const capabilities = await harness.installPlugin(
        new AnalyticsPluginClass({}),
      );

      expect(capabilities.tools).toHaveLength(0);
      harness.reset();
    });

    it("should have query tool with correct description", async () => {
      const harness = createCorePluginHarness();

      const capabilities = await harness.installPlugin(
        new AnalyticsPluginClass({
          cloudflare: {
            accountId: "abc123",
            apiToken: "cf_test_token",
            siteTag: "site123",
          },
        }),
      );

      const queryTool = capabilities.tools.find(
        (t) => t.name === "analytics_query",
      );
      expect(queryTool).toBeDefined();
      expect(queryTool?.description).toContain("Cloudflare");
      expect(queryTool?.description).toContain("Date range options");
      harness.reset();
    });
  });
});
