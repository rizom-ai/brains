import type { Plugin, ServicePluginContext, PluginTool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { Cron } from "croner";
import { toISODateString, getYesterday } from "@brains/utils";
import { analyticsConfigSchema, type AnalyticsConfig } from "./config";
import { websiteMetricsSchema } from "./schemas/website-metrics";
import { socialMetricsSchema } from "./schemas/social-metrics";
import { WebsiteMetricsAdapter } from "./adapters/website-metrics-adapter";
import { SocialMetricsAdapter } from "./adapters/social-metrics-adapter";
import { createAnalyticsTools } from "./tools";
import { CloudflareClient } from "./lib/cloudflare-client";
import { createWebsiteMetricsEntity } from "./schemas/website-metrics";
import packageJson from "../package.json";

/**
 * Analytics plugin for collecting website and social media metrics
 *
 * Collects and stores:
 * - Website metrics from Cloudflare Web Analytics (pageviews, visitors, etc.)
 * - Social media engagement metrics (via messaging to social-media plugin)
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

    // Register social metrics entity type
    const socialMetricsAdapter = new SocialMetricsAdapter();
    context.entities.register(
      "social-metrics",
      socialMetricsSchema,
      socialMetricsAdapter,
    );

    // Initialize Cloudflare client if credentials are configured
    if (this.config.cloudflare?.apiToken && this.config.cloudflare?.accountId) {
      this.cloudflareClient = new CloudflareClient(this.config.cloudflare);

      // Start daily website metrics cron (2 AM)
      this.websiteCron = new Cron("0 2 * * *", () => {
        void this.fetchDailyWebsiteMetrics();
      });
      this.logger.info("Website metrics cron started (daily at 2 AM)");
    }

    this.logger.debug("Analytics plugin registered successfully");
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
      const stats = await this.cloudflareClient.getWebsiteStats({
        startDate: yesterday,
        endDate: yesterday,
      });

      const entity = createWebsiteMetricsEntity({
        period: "daily",
        startDate: yesterday,
        endDate: yesterday,
        pageviews: stats.pageviews,
        visitors: stats.visitors,
        visits: stats.visits,
        bounces: stats.bounces,
        totalTime: stats.totalTime,
      });

      await this.context.entityService.upsertEntity(entity);

      this.logger.info("Website metrics stored", {
        date: yesterday,
        pageviews: stats.pageviews,
        visitors: stats.visitors,
      });
    } catch (error) {
      this.logger.error("Failed to fetch website metrics", { error });
    }
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
export type {
  AnalyticsConfig,
  CloudflareConfig,
  SocialAnalyticsConfig,
} from "./config";
export {
  analyticsConfigSchema,
  cloudflareConfigSchema,
  socialAnalyticsConfigSchema,
} from "./config";

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

export type {
  SocialMetricsEntity,
  SocialMetricsMetadata,
  CreateSocialMetricsInput,
} from "./schemas/social-metrics";
export {
  socialMetricsSchema,
  socialMetricsMetadataSchema,
  createSocialMetricsEntity,
} from "./schemas/social-metrics";

export { WebsiteMetricsAdapter } from "./adapters/website-metrics-adapter";
export { SocialMetricsAdapter } from "./adapters/social-metrics-adapter";
