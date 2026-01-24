import type { Plugin, ServicePluginContext, PluginTool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { Cron } from "croner";
import { toISODateString, getYesterday } from "@brains/utils";
import { analyticsConfigSchema, type AnalyticsConfig } from "./config";
import { websiteMetricsSchema } from "./schemas/website-metrics";
import { socialMetricsSchema } from "./schemas/social-metrics";
import { pageMetricsSchema } from "./schemas/page-metrics";
import { WebsiteMetricsAdapter } from "./adapters/website-metrics-adapter";
import { SocialMetricsAdapter } from "./adapters/social-metrics-adapter";
import { PageMetricsAdapter } from "./adapters/page-metrics-adapter";
import { createAnalyticsTools } from "./tools";
import { CloudflareClient } from "./lib/cloudflare-client";
import { LinkedInAnalyticsClient } from "./lib/linkedin-analytics";
import {
  createWebsiteMetricsEntity,
  type WebsiteMetricsEntity,
} from "./schemas/website-metrics";
import {
  createSocialMetricsEntity,
  type SocialMetricsEntity,
} from "./schemas/social-metrics";
import {
  createPageMetricsEntity,
  type PageMetricsEntity,
  type HistoryEntry,
} from "./schemas/page-metrics";
import packageJson from "../package.json";

/**
 * Analytics plugin for collecting website and social media metrics
 *
 * Collects and stores:
 * - Website metrics from Cloudflare Web Analytics (pageviews, visitors, etc.)
 * - Social media engagement metrics from LinkedIn
 *
 * Scheduled collection:
 * - Daily website metrics at 2 AM
 * - Social metrics every 6 hours
 */
export class AnalyticsPlugin extends ServicePlugin<AnalyticsConfig> {
  private websiteCron: Cron | null = null;
  private socialCron: Cron | null = null;
  private cloudflareClient: CloudflareClient | null = null;
  private linkedinClient: LinkedInAnalyticsClient | null = null;

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

    // Initialize LinkedIn client if credentials are configured
    if (this.config.linkedin?.accessToken) {
      this.linkedinClient = new LinkedInAnalyticsClient(
        this.config.linkedin.accessToken,
      );

      // Start social metrics cron (configurable, default: every 6 hours)
      const socialCronSchedule =
        this.config.cron?.socialMetrics ?? "0 */6 * * *";
      this.socialCron = new Cron(socialCronSchedule, () => {
        void this.fetchSocialMetrics();
      });
      this.logger.info("Social metrics cron started", {
        schedule: socialCronSchedule,
      });
    }

    // Subscribe to system:plugins:ready to register widgets AFTER Dashboard is listening
    // This solves the timing issue where Analytics plugin initializes
    // before Dashboard and widget messages would be lost.
    context.messaging.subscribe("system:plugins:ready", async () => {
      await this.registerDashboardWidgets(context);
      return { success: true };
    });

    this.logger.debug("Analytics plugin registered successfully");
  }

  /**
   * Register dashboard widgets for analytics data
   *
   * Called from system:plugins:ready callback to ensure Dashboard
   * is already subscribed to dashboard:register-widget messages.
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

    // Social engagement widget
    await context.messaging.send("dashboard:register-widget", {
      id: "social-engagement",
      pluginId: this.id,
      title: "Social Engagement",
      section: "primary",
      priority: 40,
      rendererName: "StatsWidget",
      dataProvider: async () => {
        const metrics =
          await context.entityService.listEntities<SocialMetricsEntity>(
            "social-metrics",
            {
              limit: 20,
              sortFields: [{ field: "updated", direction: "desc" }],
            },
          );
        let impressions = 0;
        let likes = 0;
        let comments = 0;
        let shares = 0;
        for (const m of metrics) {
          impressions += m.metadata.impressions;
          likes += m.metadata.likes;
          comments += m.metadata.comments;
          shares += m.metadata.shares;
        }
        return { impressions, likes, comments, shares };
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
    if (this.socialCron) {
      this.socialCron.stop();
      this.socialCron = null;
      this.logger.debug("Social metrics cron stopped");
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
   * Fetch and store social metrics for all published posts
   */
  private async fetchSocialMetrics(): Promise<void> {
    if (!this.linkedinClient || !this.context) return;

    this.logger.info("Fetching social metrics for published posts");

    try {
      // Query social-post entities to find published posts
      interface SocialPostWithFrontmatter {
        id: string;
        entityType: string;
        content: string;
        created: string;
        updated: string;
        contentHash: string;
        metadata: Record<string, unknown>;
        frontmatter?: {
          platformPostId?: string;
        };
      }

      const posts =
        await this.context.entityService.listEntities<SocialPostWithFrontmatter>(
          "social-post",
          {
            filter: { metadata: { status: "published" } },
            limit: 100,
          },
        );

      if (posts.length === 0) {
        this.logger.debug("No published social posts found");
        return;
      }

      let successCount = 0;
      for (const post of posts) {
        const platformPostId = post.frontmatter?.platformPostId;
        if (!platformPostId) continue;

        try {
          // Fetch analytics from LinkedIn
          const analytics =
            await this.linkedinClient.getPostAnalytics(platformPostId);

          // Create/update metrics entity
          const entity = createSocialMetricsEntity({
            platform: "linkedin",
            entityId: post.id,
            platformPostId,
            impressions: analytics.impressions,
            likes: analytics.likes,
            comments: analytics.comments,
            shares: analytics.shares,
          });

          await this.context.entityService.upsertEntity(entity);
          successCount++;
        } catch (postError) {
          this.logger.warn("Failed to fetch metrics for post", {
            postId: post.id,
            error: postError,
          });
        }
      }

      this.logger.info("Social metrics updated", {
        postsProcessed: posts.length,
        successCount,
      });
    } catch (error) {
      this.logger.error("Failed to fetch social metrics", { error });
    }
  }

  /**
   * Get plugin tools
   */
  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.context) {
      throw new Error("Plugin context not available");
    }
    return createAnalyticsTools(
      this.id,
      this.context,
      this.config.cloudflare,
      this.config.linkedin,
    );
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
  LinkedinAnalyticsConfig,
} from "./config";
export {
  analyticsConfigSchema,
  cloudflareConfigSchema,
  linkedinAnalyticsConfigSchema,
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
