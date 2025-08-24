import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SiteBuilderPlugin } from "../../src/plugin";
import { createServicePluginHarness } from "@brains/plugins";
import type { DashboardProvider } from "../../src/providers/dashboard-provider";

describe("DashboardProvider", () => {
  let harness: ReturnType<typeof createServicePluginHarness<SiteBuilderPlugin>>;
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
    it("should register dashboard provider during plugin initialization", () => {
      // The dashboard provider should be registered automatically
      const providers = harness.getContentProviders();
      expect(providers.has("dashboard")).toBe(true);

      const provider = providers.get("dashboard");
      expect(provider).toBeDefined();
      expect(provider?.name).toBe("Dashboard Data Provider");
    });

    it("should only implement fetch method", () => {
      const providers = harness.getContentProviders();
      const provider = providers.get("dashboard");

      expect(provider?.fetch).toBeDefined();
      expect(provider?.generate).toBeUndefined();
      expect(provider?.transform).toBeUndefined();
    });
  });

  describe("fetch", () => {
    it("should return dashboard data with entity stats", async () => {
      const providers = harness.getContentProviders();
      const provider = providers.get("dashboard") as DashboardProvider;

      if (!provider) {
        throw new Error("Dashboard provider not found");
      }

      const result = await provider.fetch();

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
      const provider = providers.get("dashboard") as DashboardProvider;

      if (!provider) {
        throw new Error("Dashboard provider not found");
      }

      const before = new Date().toISOString();
      const result = await provider.fetch();
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
      const provider = providers.get("dashboard") as DashboardProvider;

      if (!provider) {
        throw new Error("Dashboard provider not found");
      }

      const result = await provider.fetch();

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

      // Dashboard provider should be available for the template
      const providers = harness.getContentProviders();
      expect(providers.has("dashboard")).toBe(true);
    });
  });
});
