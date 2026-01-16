import type { Plugin, ServicePluginContext, PluginTool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { analyticsConfigSchema, type AnalyticsConfig } from "./config";
import { websiteMetricsSchema } from "./schemas/website-metrics";
import { socialMetricsSchema } from "./schemas/social-metrics";
import { WebsiteMetricsAdapter } from "./adapters/website-metrics-adapter";
import { SocialMetricsAdapter } from "./adapters/social-metrics-adapter";
import packageJson from "../package.json";

/**
 * Analytics plugin for collecting website and social media metrics
 *
 * Collects and stores:
 * - Website metrics from PostHog (pageviews, visitors, etc.)
 * - Social media engagement metrics (via messaging to social-media plugin)
 */
export class AnalyticsPlugin extends ServicePlugin<AnalyticsConfig> {
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

    this.logger.debug("Analytics plugin registered successfully");
  }

  /**
   * Get plugin tools
   */
  protected override async getTools(): Promise<PluginTool[]> {
    // Tools will be implemented in Phase 2 (PostHog) and Phase 3 (Social)
    return [];
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
  PosthogConfig,
  SocialAnalyticsConfig,
} from "./config";
export {
  analyticsConfigSchema,
  posthogConfigSchema,
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
