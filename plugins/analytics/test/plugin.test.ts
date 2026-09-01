import { describe, it, expect } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { analyticsPlugin, PACKAGE_METADATA } from "./helpers/install";

const CLOUDFLARE_CONFIG = {
  cloudflare: {
    accountId: "abc123",
    apiToken: "cf_test_token",
    siteTag: "site123",
  },
};

describe("analytics service", () => {
  describe("Plugin Configuration", () => {
    it("should have correct plugin metadata", () => {
      const plugin = analyticsPlugin(CLOUDFLARE_CONFIG);
      expect(plugin.id).toBe(`${PACKAGE_METADATA.name}:analytics`);
      expect(plugin.version).toBe(PACKAGE_METADATA.version);
    });

    it("should instantiate without configuration", () => {
      const plugin = analyticsPlugin();
      expect(plugin.id).toBe(`${PACKAGE_METADATA.name}:analytics`);
    });
  });

  describe("Plugin Tools", () => {
    it("should register analytics_query tool when cloudflare is configured", async () => {
      const harness = createPluginHarness();
      const capabilities = await harness.installPlugin(
        analyticsPlugin(CLOUDFLARE_CONFIG),
      );
      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("analytics_query");
      harness.reset();
    });

    it("should NOT register tools when cloudflare is not configured", async () => {
      const harness = createPluginHarness();
      const capabilities = await harness.installPlugin(analyticsPlugin());
      expect(capabilities.tools).toHaveLength(0);
      harness.reset();
    });

    it("should have query tool with correct description", async () => {
      const harness = createPluginHarness();
      const capabilities = await harness.installPlugin(
        analyticsPlugin(CLOUDFLARE_CONFIG),
      );
      const queryTool = capabilities.tools.find(
        (t) => t.name === "analytics_query",
      );
      expect(queryTool).toBeDefined();
      expect(queryTool?.description).toContain("Cloudflare");
      expect(queryTool?.description).toContain("Date range options");
      expect(queryTool?.visibility).toBe("admin");
      expect(queryTool?.sideEffects).toBe("none");
      expect(queryTool?.agentTool).toBe(false);
      harness.reset();
    });
  });
});
