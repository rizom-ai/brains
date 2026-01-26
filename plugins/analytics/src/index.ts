import type { Plugin, ServicePluginContext, PluginTool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { Cron } from "croner";
import { toISODateString, getYesterday } from "@brains/utils";
import { analyticsConfigSchema, type AnalyticsConfig } from "./config";
import { websiteMetricsSchema } from "./schemas/website-metrics";
import { pageMetricsSchema } from "./schemas/page-metrics";
import { WebsiteMetricsAdapter } from "./adapters/website-metrics-adapter";
import { PageMetricsAdapter } from "./adapters/page-metrics-adapter";
import { createAnalyticsTools } from "./tools";
import { CloudflareClient } from "./lib/cloudflare-client";
import {
  createWebsiteMetricsEntity,
  type WebsiteMetricsEntity,
} from "./schemas/website-metrics";
import {
  createPageMetricsEntity,
  type PageMetricsEntity,
  type HistoryEntry,
} from "./schemas/page-metrics";
import packageJson from "../package.json";

/**
 * Analytics plugin for collecting website metrics
 *
 * Collects and stores:
 * - Website metrics from Cloudflare Web Analytics (pageviews, visitors, etc.)
 *
 * Scheduled collection:
 * - Daily website metrics at 2 AM
 */
export class AnalyticsPlugin extends ServicePlugin<AnalyticsConfig> {
  private websiteCron: Cron | null = null;
  private cloudflareClient: CloudflareClient | null = null;

  constructor(config: Partial<AnalyticsConfig> = {}) {
    super("analytics", packageJson, config, analyticsConfigSchema);
  }

  /**
   * Register plugin components
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Register website metrics entity type
    const websiteMetricsAdapter = new WebsiteMetricsAdapter();
    context.entities.register(
      "website-metrics",
      websiteMetricsSchema,
      websiteMetricsAdapter,
    );

    // Register page metrics entity type
    const pageMetricsAdapter = new PageMetricsAdapter();
    context.entities.register(
      "page-metrics",
      pageMetricsSchema,
      pageMetricsAdapter,
    );

    // Initialize Cloudflare client if credentials are configured
    if (this.config.cloudflare?.apiToken && this.config.cloudflare.accountId) {
      this.cloudflareClient = new CloudflareClient(this.config.cloudflare);

      // Start website metrics cron (configurable, default: daily at 2 AM)
      const websiteCronSchedule =
        this.config.cron?.websiteMetrics ?? "0 2 * * *";
      this.websiteCron = new Cron(websiteCronSchedule, () => {
        void this.fetchDailyWebsiteMetrics();
      });
      this.logger.info("Website metrics cron started", {
        schedule: websiteCronSchedule,
      });
    }

    // Subscribe to system:plugins:ready to register widgets AFTER Dashboard is listening
    context.messaging.subscribe("system:plugins:ready", async () => {
      await this.registerDashboardWidgets(context);
      return { success: true };
    });

    this.logger.debug("Analytics plugin registered successfully");
  }

  /**
   * Register dashboard widgets for analytics data
   */
  private async registerDashboardWidgets(
    context: ServicePluginContext,
  ): Promise<void> {
    // Website metrics widget
    await context.messaging.send("dashboard:register-widget", {
      id: "website-metrics",
      pluginId: this.id,
      title: "Website Analytics",
      section: "primary",
      priority: 30,
      rendererName: "StatsWidget",
      dataProvider: async () => {
        const metrics =
          await context.entityService.listEntities<WebsiteMetricsEntity>(
            "website-metrics",
            {
              limit: 1,
              sortFields: [{ field: "created", direction: "desc" }],
            },
          );
        const latest = metrics[0]?.metadata;
        return {
          pageviews: latest?.pageviews ?? 0,
          visitors: latest?.visitors ?? 0,
        };
      },
    });

    // Top Pages widget
    await context.messaging.send("dashboard:register-widget", {
      id: "top-pages",
      pluginId: this.id,
      title: "Top Pages",
      section: "primary",
      priority: 31,
      rendererName: "ListWidget",
      dataProvider: async () => {
        const metrics =
          await context.entityService.listEntities<WebsiteMetricsEntity>(
            "website-metrics",
            {
              limit: 1,
              sortFields: [{ field: "created", direction: "desc" }],
            },
          );
        const latest = metrics[0];
        if (!latest) return { items: [] };

        const adapter = new WebsiteMetricsAdapter();
        const frontmatter = adapter.parseFrontmatterData(latest);
        return {
          items: frontmatter.topPages.slice(0, 10).map((p) => ({
            id: p.path,
            name: `${p.path} (${p.views})`,
          })),
        };
      },
    });

    // Traffic Sources widget
    await context.messaging.send("dashboard:register-widget", {
      id: "traffic-sources",
      pluginId: this.id,
      title: "Traffic Sources",
      section: "sidebar",
      priority: 50,
      rendererName: "ListWidget",
      dataProvider: async () => {
        const metrics =
          await context.entityService.listEntities<WebsiteMetricsEntity>(
            "website-metrics",
            {
              limit: 1,
              sortFields: [{ field: "created", direction: "desc" }],
            },
          );
        const latest = metrics[0];
        if (!latest) return { items: [] };

        const adapter = new WebsiteMetricsAdapter();
        const frontmatter = adapter.parseFrontmatterData(latest);
        return {
          items: frontmatter.topReferrers.slice(0, 10).map((r) => ({
            id: r.host,
            name: `${r.host} (${r.visits})`,
          })),
        };
      },
    });

    // Devices widget
    await context.messaging.send("dashboard:register-widget", {
      id: "devices",
      pluginId: this.id,
      title: "Devices",
      section: "sidebar",
      priority: 51,
      rendererName: "StatsWidget",
      dataProvider: async () => {
        const metrics =
          await context.entityService.listEntities<WebsiteMetricsEntity>(
            "website-metrics",
            {
              limit: 1,
              sortFields: [{ field: "created", direction: "desc" }],
            },
          );
        const latest = metrics[0];
        if (!latest) return { desktop: 0, mobile: 0, tablet: 0 };

        const adapter = new WebsiteMetricsAdapter();
        const frontmatter = adapter.parseFrontmatterData(latest);
        return frontmatter.devices;
      },
    });

    // Countries widget
    await context.messaging.send("dashboard:register-widget", {
      id: "countries",
      pluginId: this.id,
      title: "Top Countries",
      section: "sidebar",
      priority: 52,
      rendererName: "ListWidget",
      dataProvider: async () => {
        const metrics =
          await context.entityService.listEntities<WebsiteMetricsEntity>(
            "website-metrics",
            {
              limit: 1,
              sortFields: [{ field: "created", direction: "desc" }],
            },
          );
        const latest = metrics[0];
        if (!latest) return { items: [] };

        const adapter = new WebsiteMetricsAdapter();
        const frontmatter = adapter.parseFrontmatterData(latest);
        return {
          items: frontmatter.topCountries.slice(0, 10).map((c) => ({
            id: c.country,
            name: `${c.country} (${c.visits})`,
          })),
        };
      },
    });

    this.logger.debug("Analytics dashboard widgets registered");
  }

  /**
   * Cleanup on shutdown
   */
  protected override async onShutdown(): Promise<void> {
    if (this.websiteCron) {
      this.websiteCron.stop();
      this.websiteCron = null;
      this.logger.debug("Website metrics cron stopped");
    }
  }

  /**
   * Fetch and store daily website metrics for yesterday
   */
  private async fetchDailyWebsiteMetrics(): Promise<void> {
    if (!this.cloudflareClient || !this.context) return;

    const yesterday = toISODateString(getYesterday());
    this.logger.info("Fetching daily website metrics", { date: yesterday });

    try {
      // Fetch all data from Cloudflare in parallel
      const [stats, topPages, topReferrers, devices, topCountries] =
        await Promise.all([
          this.cloudflareClient.getWebsiteStats({
            startDate: yesterday,
            endDate: yesterday,
          }),
          this.cloudflareClient.getTopPages({
            startDate: yesterday,
            endDate: yesterday,
            limit: 20,
          }),
          this.cloudflareClient.getTopReferrers({
            startDate: yesterday,
            endDate: yesterday,
            limit: 20,
          }),
          this.cloudflareClient.getDeviceBreakdown({
            startDate: yesterday,
            endDate: yesterday,
          }),
          this.cloudflareClient.getTopCountries({
            startDate: yesterday,
            endDate: yesterday,
            limit: 20,
          }),
        ]);

      const entity = createWebsiteMetricsEntity({
        date: yesterday,
        pageviews: stats.pageviews,
        visitors: stats.visitors,
        topPages,
        topReferrers,
        devices,
        topCountries,
      });

      await this.context.entityService.upsertEntity(entity);

      // Update page-metrics for each top page
      await this.updatePageMetrics(yesterday, topPages);

      this.logger.info("Website metrics stored", {
        date: yesterday,
        pageviews: stats.pageviews,
        visitors: stats.visitors,
        topPagesCount: topPages.length,
        topReferrersCount: topReferrers.length,
      });
    } catch (error) {
      this.logger.error("Failed to fetch website metrics", { error });
    }
  }

  /**
   * Update page-metrics entities for each page in the top pages list
   */
  private async updatePageMetrics(
    date: string,
    topPages: Array<{ path: string; views: number }>,
  ): Promise<void> {
    if (!this.context) return;

    for (const page of topPages) {
      try {
        // Try to get existing page-metrics entity
        const existingId = this.pathToId(page.path);
        const existing =
          await this.context.entityService.getEntity<PageMetricsEntity>(
            "page-metrics",
            existingId,
          );

        let existingHistory: HistoryEntry[] = [];
        let existingTotal = 0;

        if (existing) {
          // Parse frontmatter to get history
          const adapter = new PageMetricsAdapter();
          const frontmatter = adapter.parseFrontmatterData(existing);
          existingHistory = frontmatter.history;
          existingTotal = frontmatter.totalPageviews;
        }

        // Create updated entity
        const pageMetrics = createPageMetricsEntity({
          path: page.path,
          views: page.views,
          date,
          existingHistory,
          existingTotal,
        });

        await this.context.entityService.upsertEntity(pageMetrics);
      } catch (error) {
        this.logger.warn("Failed to update page metrics", {
          path: page.path,
          error,
        });
      }
    }

    this.logger.debug("Page metrics updated", { count: topPages.length });
  }

  /**
   * Convert path to entity ID
   */
  private pathToId(path: string): string {
    if (path === "/") return "page-metrics-root";

    const slug = path
      .replace(/^\//, "")
      .replace(/\//g, "-")
      .replace(/[^a-z0-9-]/gi, "-")
      .replace(/-+/g, "-")
      .replace(/-$/, "");

    return `page-metrics-${slug}`;
  }

  /**
   * Get plugin tools
   */
  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.context) {
      throw new Error("Plugin context not available");
    }
    return createAnalyticsTools(this.id, this.context, this.config.cloudflare);
  }
}

/**
 * Create an analytics plugin instance
 */
export function createAnalyticsPlugin(
  config: Partial<AnalyticsConfig> = {},
): Plugin {
  return new AnalyticsPlugin(config);
}

/**
 * Convenience function matching other plugin patterns
 */
export const analyticsPlugin = createAnalyticsPlugin;

// Export types and schemas
export type { AnalyticsConfig, CloudflareConfig } from "./config";
export { analyticsConfigSchema, cloudflareConfigSchema } from "./config";

export type {
  WebsiteMetricsEntity,
  WebsiteMetricsMetadata,
  CreateWebsiteMetricsInput,
} from "./schemas/website-metrics";
export {
  websiteMetricsSchema,
  websiteMetricsMetadataSchema,
  createWebsiteMetricsEntity,
} from "./schemas/website-metrics";

export { WebsiteMetricsAdapter } from "./adapters/website-metrics-adapter";

export type {
  PageMetricsEntity,
  PageMetricsMetadata,
  CreatePageMetricsInput,
  HistoryEntry,
} from "./schemas/page-metrics";
export {
  pageMetricsSchema,
  pageMetricsMetadataSchema,
  createPageMetricsEntity,
} from "./schemas/page-metrics";

export { PageMetricsAdapter } from "./adapters/page-metrics-adapter";
