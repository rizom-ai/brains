import { describe, it, expect, beforeEach } from "bun:test";
import type { AnalyticsPlugin } from "../src/index";
import {
  createAnalyticsPlugin,
  AnalyticsPlugin as AnalyticsPluginClass,
} from "../src/index";
import { createPluginHarness } from "@brains/plugins/test";
import packageJson from "../package.json";

describe("AnalyticsPlugin", () => {
  let plugin: AnalyticsPlugin;

  beforeEach(() => {
    plugin = createAnalyticsPlugin({
      cloudflare: {
        accountId: "abc123",
        apiToken: "cf_test_token",
        siteTag: "site123",
      },
    });
  });

  describe("Plugin Configuration", () => {
    it("should have correct plugin metadata", () => {
      expect(plugin.id).toBe("analytics");
      expect(plugin.description).toContain("Analytics");
      expect(plugin.version).toBe(packageJson.version);
    });

    it("should use default configuration when not provided", () => {
      const defaultPlugin = createAnalyticsPlugin();
      expect(defaultPlugin.id).toBe("analytics");
      expect(defaultPlugin.version).toBe(packageJson.version);
    });

    it("should accept custom configuration", () => {
      const customPlugin = createAnalyticsPlugin({
        cloudflare: {
          accountId: "custom",
          apiToken: "cf_custom",
          siteTag: "custom_site",
        },
      });

      expect(customPlugin.id).toBe("analytics");
      expect(customPlugin.version).toBe(packageJson.version);
    });
  });

  describe("Plugin Tools", () => {
    it("registers no tools: traffic is asked through system_analytics", async () => {
      const harness = createPluginHarness();

      const capabilities = await harness.installPlugin(
        new AnalyticsPluginClass({
          cloudflare: {
            accountId: "abc123",
            apiToken: "cf_test_token",
            siteTag: "site123",
          },
        }),
      );

      expect(capabilities.tools).toHaveLength(0);
      await harness.reset();
    });
  });
});
