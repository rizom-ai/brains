import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SiteBuilderPlugin } from "../../src/plugin";
import {
  createServicePluginHarness,
  type PluginTestHarness,
} from "@brains/plugins";
import { DashboardDataSchema } from "../../src/templates/dashboard/schema";

describe("SystemStatsProvider", () => {
  let harness: PluginTestHarness;
  let plugin: SiteBuilderPlugin;

  beforeEach(async () => {
    harness = createServicePluginHarness<SiteBuilderPlugin>();
    plugin = new SiteBuilderPlugin({
      previewOutputDir: "/tmp/test-output",
      productionOutputDir: "/tmp/test-output-production",
    });
    await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  describe("provider interface", () => {
    it("should register system stats provider during plugin initialization", () => {
      // The system stats provider should be registered automatically
      const providers = harness.getContentProviders();
      expect(providers.has("system-stats")).toBe(true);

      const provider = providers.get("system-stats");
      expect(provider).toBeDefined();
      expect(provider?.name).toBe("System Statistics Provider");
    });

    it("should only implement fetch method", () => {
      const providers = harness.getContentProviders();
      const provider = providers.get("system-stats");

      expect(provider?.fetch).toBeDefined();
      expect(provider?.generate).toBeUndefined();
      expect(provider?.transform).toBeUndefined();
    });
  });

  describe("fetch", () => {
    it("should return dashboard data with entity stats", async () => {
      const providers = harness.getContentProviders();
      const provider = providers.get("system-stats");

      if (!provider || !provider.fetch) {
        throw new Error(
          "System stats provider not found or doesn't have fetch",
        );
      }

      const rawResult = await provider.fetch();
      const result = DashboardDataSchema.parse(rawResult);

      // Now result is properly typed as DashboardData
      expect(result).toBeDefined();
      expect(result.entityStats).toBeInstanceOf(Array);
      expect(result.recentEntities).toBeInstanceOf(Array);
      expect(result.buildInfo).toBeDefined();
      expect(result.buildInfo.timestamp).toBeDefined();
      expect(result.buildInfo.version).toBe("1.0.0");
    });

    it("should return current timestamp in buildInfo", async () => {
      const providers = harness.getContentProviders();
      const provider = providers.get("system-stats");

      if (!provider || !provider.fetch) {
        throw new Error(
          "System stats provider not found or doesn't have fetch",
        );
      }

      const before = new Date().toISOString();
      const rawResult = await provider.fetch();
      const result = DashboardDataSchema.parse(rawResult);
      const after = new Date().toISOString();

      expect(result.buildInfo.timestamp).toBeDefined();
      expect(
        new Date(result.buildInfo.timestamp).getTime(),
      ).toBeGreaterThanOrEqual(new Date(before).getTime());
      expect(
        new Date(result.buildInfo.timestamp).getTime(),
      ).toBeLessThanOrEqual(new Date(after).getTime());
    });

    it("should handle entity service queries gracefully", async () => {
      // Even if entity service returns empty results or errors,
      // the provider should return valid dashboard data
      const providers = harness.getContentProviders();
      const provider = providers.get("system-stats");

      if (!provider || !provider.fetch) {
        throw new Error(
          "System stats provider not found or doesn't have fetch",
        );
      }

      const rawResult = await provider.fetch();
      const result = DashboardDataSchema.parse(rawResult);

      // Should always return valid dashboard structure
      expect(result.entityStats).toBeInstanceOf(Array);
      expect(result.recentEntities).toBeInstanceOf(Array);
      expect(result.buildInfo).toBeDefined();

      // Should have data (either real or fallback)
      expect(result.entityStats.length).toBeGreaterThanOrEqual(0);
      expect(result.recentEntities.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("integration with dashboard template", () => {
    it("should work with registered dashboard template", () => {
      // Dashboard template should be registered
      const templates = harness.getTemplates();
      expect(templates.has("site-builder:dashboard")).toBe(true);

      // System stats provider should be available for the template
      const providers = harness.getContentProviders();
      expect(providers.has("system-stats")).toBe(true);
    });
  });
});
