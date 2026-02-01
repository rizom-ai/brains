import type { Plugin, PluginTool } from "@brains/plugins";
import { CorePlugin } from "@brains/plugins";
import { analyticsConfigSchema, type AnalyticsConfig } from "./config";
import { createAnalyticsTools } from "./tools";
import packageJson from "../package.json";

/**
 * Analytics plugin for querying website metrics from Cloudflare
 *
 * Provides real-time access to Cloudflare Web Analytics data:
 * - Pageviews and visitors
 * - Top pages, referrers, countries
 * - Device breakdown
 *
 * Privacy-focused: uses Cloudflare Web Analytics (no cookies, GDPR compliant)
 */
export class AnalyticsPlugin extends CorePlugin<AnalyticsConfig> {
  constructor(config: Partial<AnalyticsConfig> = {}) {
    super("analytics", packageJson, config, analyticsConfigSchema);
  }

  /**
   * Get plugin tools
   */
  protected override async getTools(): Promise<PluginTool[]> {
    return createAnalyticsTools(
      this.id,
      this.getContext(),
      this.config.cloudflare,
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
export type { AnalyticsConfig, CloudflareConfig } from "./config";
export { analyticsConfigSchema, cloudflareConfigSchema } from "./config";

// Export CloudflareClient for direct use if needed
export { CloudflareClient } from "./lib/cloudflare-client";
export type {
  WebsiteStats,
  TopPageResult,
  TopReferrerResult,
  TopCountryResult,
  DeviceBreakdownResult,
} from "./lib/cloudflare-client";
