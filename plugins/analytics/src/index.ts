import type { Tool, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import {
  analyticsConfigSchema,
  type AnalyticsConfig,
  type AnalyticsConfigInput,
} from "./config";
import { createAnalyticsTools } from "./tools";
import { generateCloudflareBeaconScript } from "./lib/beacon-script";
import {
  CloudflareClient,
  type CloudflareClientDeps,
} from "./lib/cloudflare-client";
import { createTrafficOverviewInsight } from "./insights/traffic-overview";
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
export class AnalyticsPlugin extends ServicePlugin<
  AnalyticsConfig,
  AnalyticsConfigInput
> {
  private cloudflareClient: CloudflareClient | undefined;

  private deps: CloudflareClientDeps;

  constructor(
    config: AnalyticsConfigInput = {},
    deps: CloudflareClientDeps = {},
  ) {
    super("analytics", packageJson, config, analyticsConfigSchema);
    this.deps = deps;
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.cloudflareClient = this.config.cloudflare
      ? new CloudflareClient(this.config.cloudflare, this.deps)
      : undefined;

    context.insights.register(
      "traffic-overview",
      createTrafficOverviewInsight(this.cloudflareClient),
    );

    // Site builds run in the worker and ask for head scripts as they render,
    // so the beacon answers there; that process never runs the ready phase.
    // Only with a beacon token: the beacon carries the site token, not the
    // site tag, and a zone with automatic setup gets it from Cloudflare.
    const beaconToken = this.config.cloudflare?.beaconToken;
    if (beaconToken) {
      const script = generateCloudflareBeaconScript(beaconToken);
      context.messaging.subscribeExecution(
        SITE_BUILDER_CHANNELS.headScripts,
        async () => ({ success: true, data: script }),
      );
    }
  }

  protected override async getTools(): Promise<Tool[]> {
    return createAnalyticsTools(
      this.id,
      this.getContext(),
      this.cloudflareClient,
    );
  }
}

/**
 * Create an analytics plugin instance
 */
export function createAnalyticsPlugin(
  config: AnalyticsConfigInput = {},
  deps: CloudflareClientDeps = {},
): AnalyticsPlugin {
  return new AnalyticsPlugin(config, deps);
}

/**
 * Convenience function matching other plugin patterns
 */
export const analyticsPlugin: typeof createAnalyticsPlugin =
  createAnalyticsPlugin;

// Export types and schemas
export type {
  AnalyticsConfig,
  AnalyticsConfigInput,
  CloudflareConfig,
} from "./config";
export { analyticsConfigSchema, cloudflareConfigSchema } from "./config";
