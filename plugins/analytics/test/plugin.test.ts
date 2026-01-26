import { describe, it, expect, beforeEach } from "bun:test";
import type { AnalyticsPlugin } from "../src/index";
import {
  createAnalyticsPlugin,
  AnalyticsPlugin as AnalyticsPluginClass,
} from "../src/index";
import { WebsiteMetricsAdapter } from "../src/adapters/website-metrics-adapter";
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
    it("should register website-metrics widget after system:plugins:ready", async () => {
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

      // Widgets should NOT be registered yet (before system:plugins:ready)
      expect(registeredWidgets).toHaveLength(0);

      // Emit system:plugins:ready - this triggers widget registration
      await harness.sendMessage("system:plugins:ready", {
        timestamp: new Date().toISOString(),
        pluginCount: 1,
      });

      expect(registeredWidgets).toContainEqual({
        id: "website-metrics",
        pluginId: "analytics",
      });
      harness.reset();
    });

    it("should NOT register widgets before system:plugins:ready", async () => {
      // This test verifies the timing fix - widgets should only be sent
      // after system:plugins:ready, ensuring Dashboard has subscribed first
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

      // Widgets should NOT be registered yet
      expect(registeredWidgets).toHaveLength(0);
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
      // Create entity with content containing frontmatter (as it would be stored)
      const content = `---
date: "2025-01-15"
pageviews: 1500
visitors: 450
topPages:
  - path: /essays/test
    views: 45
topReferrers:
  - host: google.com
    visits: 25
devices:
  desktop: 60
  mobile: 38
  tablet: 2
topCountries:
  - country: United States
    visits: 40
---

# Website Metrics

Website metrics for 2025-01-15`;

      const entity = {
        id: "website-metrics-2025-01-15",
        entityType: "website-metrics" as const,
        content,
        contentHash: "abc123",
        created: "2025-01-15T10:00:00.000Z",
        updated: "2025-01-15T10:00:00.000Z",
        metadata: {
          date: "2025-01-15",
          pageviews: 1500,
          visitors: 450,
        },
      };

      const markdown = adapter.toMarkdown(entity);
      expect(markdown).toContain("---");
      expect(markdown).toContain("pageviews: 1500");
      expect(markdown).toContain("# Website Metrics");
      expect(markdown).toContain("topPages:");
      expect(markdown).toContain("devices:");
    });

    it("should extract metadata from entity", () => {
      const entity = {
        id: "website-metrics-2025-01-15",
        entityType: "website-metrics" as const,
        content: "",
        contentHash: "abc123",
        created: "2025-01-15T10:00:00.000Z",
        updated: "2025-01-15T10:00:00.000Z",
        metadata: {
          date: "2025-01-15",
          pageviews: 1500,
          visitors: 450,
        },
      };

      const metadata = adapter.extractMetadata(entity);
      expect(metadata.pageviews).toBe(1500);
      expect(metadata.date).toBe("2025-01-15");
      expect(metadata.visitors).toBe(450);
    });

    it("should parse frontmatter data including breakdowns", () => {
      const content = `---
date: "2025-01-15"
pageviews: 1500
visitors: 450
topPages:
  - path: /essays/test
    views: 45
topReferrers:
  - host: google.com
    visits: 25
devices:
  desktop: 60
  mobile: 38
  tablet: 2
topCountries:
  - country: United States
    visits: 40
---

# Website Metrics`;

      const entity = {
        id: "website-metrics-2025-01-15",
        entityType: "website-metrics" as const,
        content,
        contentHash: "abc123",
        created: "2025-01-15T10:00:00.000Z",
        updated: "2025-01-15T10:00:00.000Z",
        metadata: {
          date: "2025-01-15",
          pageviews: 1500,
          visitors: 450,
        },
      };

      const frontmatter = adapter.parseFrontmatterData(entity);
      expect(frontmatter.date).toBe("2025-01-15");
      expect(frontmatter.topPages).toHaveLength(1);
      expect(frontmatter.topPages[0]?.path).toBe("/essays/test");
      expect(frontmatter.devices.desktop).toBe(60);
      expect(frontmatter.topCountries[0]?.country).toBe("United States");
    });
  });
});
