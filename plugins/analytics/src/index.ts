import type { Plugin, PluginTool, CorePluginContext } from "@brains/plugins";
import { CorePlugin } from "@brains/plugins";
import { analyticsConfigSchema, type AnalyticsConfig } from "./config";
import { createAnalyticsTools } from "./tools";
import { generateCloudflareBeaconScript } from "./lib/beacon-script";
import packageJson from "../package.json";

/**
 * Analytics plugin for querying website metrics from Cloudflare
 *
 * Provides real-time access to Cloudflare Web Analytics data:
 * - Pageviews and visitors
 * - Top pages, referrers, countries
 * - Device breakdown
 *
 * Also injects the Cloudflare Web Analytics beacon script into
 * site builds via the site-builder's head-script registration hook.
 *
 * Privacy-focused: uses Cloudflare Web Analytics (no cookies, GDPR compliant)
 */
export class AnalyticsPlugin extends CorePlugin<AnalyticsConfig> {
  constructor(config: Partial<AnalyticsConfig> = {}) {
    super("analytics", packageJson, config, analyticsConfigSchema);
  }

  protected override async onRegister(
    context: CorePluginContext,
  ): Promise<void> {
    const siteTag = this.config.cloudflare?.siteTag;
    if (siteTag) {
      // Wait until all plugins are registered so site-builder's
      // head-script handler is subscribed before we send the message
      context.messaging.subscribe("system:plugins:ready", async () => {
        await context.messaging.send(
          "plugin:site-builder:head-script:register",
          {
            pluginId: this.id,
            script: generateCloudflareBeaconScript(siteTag),
          },
        );
        return { success: true };
      });
    }
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
