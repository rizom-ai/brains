import { describe, it, expect, beforeEach } from "bun:test";
import type { AnalyticsPlugin } from "../src/index";
import {
  createAnalyticsPlugin,
  AnalyticsPlugin as AnalyticsPluginClass,
} from "../src/index";
import { WebsiteMetricsAdapter } from "../src/adapters/website-metrics-adapter";
import { SocialMetricsAdapter } from "../src/adapters/social-metrics-adapter";
import { createServicePluginHarness } from "@brains/plugins/test";

describe("AnalyticsPlugin", () => {
  let plugin: AnalyticsPlugin;

  beforeEach(() => {
    plugin = createAnalyticsPlugin({
      cloudflare: {
        accountId: "abc123",
        apiToken: "cf_test_token",
        siteTag: "site123",
      },
      linkedin: {
        accessToken: "test_token",
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

  describe("Dashboard Widget Registration", () => {
    it("should register website-metrics widget on startup", async () => {
      const harness = createServicePluginHarness({
        dataDir: "/tmp/test-datadir",
      });
      const registeredWidgets: Array<{ id: string; pluginId: string }> = [];

      harness.subscribe("dashboard:register-widget", (message) => {
        const payload = message.payload as { id: string; pluginId: string };
        registeredWidgets.push({ id: payload.id, pluginId: payload.pluginId });
        return { success: true };
      });

      await harness.installPlugin(new AnalyticsPluginClass());

      expect(registeredWidgets).toContainEqual({
        id: "website-metrics",
        pluginId: "analytics",
      });
      harness.reset();
    });

    it("should register social-engagement widget on startup", async () => {
      const harness = createServicePluginHarness({
        dataDir: "/tmp/test-datadir",
      });
      const registeredWidgets: Array<{ id: string; pluginId: string }> = [];

      harness.subscribe("dashboard:register-widget", (message) => {
        const payload = message.payload as { id: string; pluginId: string };
        registeredWidgets.push({ id: payload.id, pluginId: payload.pluginId });
        return { success: true };
      });

      await harness.installPlugin(new AnalyticsPluginClass());

      expect(registeredWidgets).toContainEqual({
        id: "social-engagement",
        pluginId: "analytics",
      });
      harness.reset();
    });
  });

  describe("WebsiteMetricsAdapter", () => {
    let adapter: WebsiteMetricsAdapter;

    beforeEach(() => {
      adapter = new WebsiteMetricsAdapter();
    });

    it("should have correct entity type and schema", () => {
      expect(adapter.entityType).toBe("website-metrics");
      expect(adapter.schema).toBeDefined();
    });

    it("should convert entity to markdown with frontmatter", () => {
      const entity = {
        id: "website-metrics-daily-2025-01-15",
        entityType: "website-metrics" as const,
        content: "",
        contentHash: "abc123",
        created: "2025-01-15T10:00:00.000Z",
        updated: "2025-01-15T10:00:00.000Z",
        metadata: {
          period: "daily" as const,
          startDate: "2025-01-15",
          endDate: "2025-01-15",
          pageviews: 1500,
          visitors: 450,
          visits: 600,
          bounces: 180,
          totalTime: 27000,
          bounceRate: 0.3,
          avgTimeOnPage: 45,
        },
      };

      const markdown = adapter.toMarkdown(entity);
      expect(markdown).toContain("---");
      expect(markdown).toContain("period: daily");
      expect(markdown).toContain("pageviews: 1500");
      expect(markdown).toContain("# Website Metrics: daily");
    });

    it("should extract metadata from entity", () => {
      const entity = {
        id: "website-metrics-daily-2025-01-15",
        entityType: "website-metrics" as const,
        content: "",
        contentHash: "abc123",
        created: "2025-01-15T10:00:00.000Z",
        updated: "2025-01-15T10:00:00.000Z",
        metadata: {
          period: "daily" as const,
          startDate: "2025-01-15",
          endDate: "2025-01-15",
          pageviews: 1500,
          visitors: 450,
          visits: 600,
          bounces: 180,
          totalTime: 27000,
          bounceRate: 0.3,
          avgTimeOnPage: 45,
        },
      };

      const metadata = adapter.extractMetadata(entity);
      expect(metadata.period).toBe("daily");
      expect(metadata.pageviews).toBe(1500);
    });
  });

  describe("SocialMetricsAdapter", () => {
    let adapter: SocialMetricsAdapter;

    beforeEach(() => {
      adapter = new SocialMetricsAdapter();
    });

    it("should have correct entity type and schema", () => {
      expect(adapter.entityType).toBe("social-metrics");
      expect(adapter.schema).toBeDefined();
    });

    it("should convert entity to markdown with frontmatter", () => {
      const entity = {
        id: "social-metrics-urn-li-ugcPost-123",
        entityType: "social-metrics" as const,
        content: "",
        contentHash: "abc123",
        created: "2025-01-15T10:00:00.000Z",
        updated: "2025-01-15T10:00:00.000Z",
        metadata: {
          platform: "linkedin" as const,
          entityId: "social-post-test",
          platformPostId: "urn:li:ugcPost:123",
          snapshotDate: "2025-01-15T10:00:00.000Z",
          impressions: 5000,
          likes: 150,
          comments: 25,
          shares: 10,
          engagementRate: 0.037,
        },
      };

      const markdown = adapter.toMarkdown(entity);
      expect(markdown).toContain("---");
      expect(markdown).toContain("platform: linkedin");
      expect(markdown).toContain("impressions: 5000");
      expect(markdown).toContain("# Social Metrics: linkedin");
    });

    it("should extract metadata from entity", () => {
      const entity = {
        id: "social-metrics-urn-li-ugcPost-123",
        entityType: "social-metrics" as const,
        content: "",
        contentHash: "abc123",
        created: "2025-01-15T10:00:00.000Z",
        updated: "2025-01-15T10:00:00.000Z",
        metadata: {
          platform: "linkedin" as const,
          entityId: "social-post-test",
          platformPostId: "urn:li:ugcPost:123",
          snapshotDate: "2025-01-15T10:00:00.000Z",
          impressions: 5000,
          likes: 150,
          comments: 25,
          shares: 10,
          engagementRate: 0.037,
        },
      };

      const metadata = adapter.extractMetadata(entity);
      expect(metadata.platform).toBe("linkedin");
      expect(metadata.impressions).toBe(5000);
    });
  });
});
