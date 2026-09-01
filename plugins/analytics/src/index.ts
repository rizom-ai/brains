import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { analyticsConfigSchema } from "./config";
import { createAnalyticsTools } from "./tools";
import { generateCloudflareBeaconScript } from "./lib/beacon-script";
import { CloudflareClient } from "./lib/cloudflare-client";
import { createTrafficOverviewInsight } from "./insights/traffic-overview";

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
const analyticsPackage: ServicePackageDefinition<typeof analyticsConfigSchema> =
  defineServicePlugin({
    id: "analytics",
    config: analyticsConfigSchema,

    setup: ({ config }) => ({
      client: config.cloudflare
        ? new CloudflareClient(config.cloudflare)
        : undefined,
    }),

    insights: ({ state }) => ({
      "traffic-overview": createTrafficOverviewInsight(state.client),
    }),

    tools: ({ state }) => createAnalyticsTools(state.client),

    // The beacon reaches site builds through the head-script channel, and
    // site-builder's subscription only exists once every plugin has
    // registered — which is what `ready` is for.
    ready: async ({ config, messaging }) => {
      const siteTag = config.cloudflare?.siteTag;
      if (!siteTag) return;

      await messaging.send({
        type: SITE_BUILDER_CHANNELS.headScriptRegister,
        payload: {
          pluginId: "analytics",
          script: generateCloudflareBeaconScript(siteTag),
        },
      });
    },
  });

export default analyticsPackage;

// Export types and schemas
export type {
  AnalyticsConfig,
  AnalyticsConfigInput,
  CloudflareConfig,
} from "./config";
export { analyticsConfigSchema, cloudflareConfigSchema } from "./config";
