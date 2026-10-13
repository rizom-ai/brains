import {
  defineServicePlugin,
  defineSubscription,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { analyticsConfigSchema } from "./config";
import { createAnalyticsTools } from "./tools";
import { generateCloudflareBeaconScript } from "./lib/beacon-script";
import {
  CloudflareClient,
  type CloudflareFetch,
} from "./lib/cloudflare-client";
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
 * site builds via a build-time, worker-enabled contribution.
 *
 * Privacy-focused: uses Cloudflare Web Analytics (no cookies, GDPR compliant)
 */
/**
 * What this package reaches the outside world through.
 *
 * Only one thing, and only for a test: the Cloudflare client binds the global
 * fetch, so a test asserting what was requested would otherwise have to
 * reassign `globalThis.fetch` before installing the plugin and put it back
 * afterwards. Production passes nothing.
 */
export interface AnalyticsDependencies {
  fetch?: CloudflareFetch | undefined;
}

export function analyticsService(
  dependencies: AnalyticsDependencies = {},
): ServicePackageDefinition<typeof analyticsConfigSchema> {
  return defineServicePlugin(
    {
      id: "analytics",
      config: analyticsConfigSchema,

      setup: ({ config }) => ({
        client: config.cloudflare
          ? new CloudflareClient(config.cloudflare, dependencies)
          : undefined,
      }),
    },
    {
      insights: ({ state }) => ({
        "traffic-overview": createTrafficOverviewInsight(state.client),
      }),

      tools: ({ state }) => createAnalyticsTools(state.client),

      // Workers do not run ready. Each build asks installed contributors
      // instead of depending on a different process's registration map.
      subscriptions: ({ config }) => {
        const siteTag = config.cloudflare?.siteTag;
        return siteTag
          ? [
              defineSubscription({
                topic: SITE_BUILDER_CHANNELS.headScripts,
                payload: z.object({}),
                response: z.string(),
                execution: "all-roles",
                handle: () => generateCloudflareBeaconScript(siteTag),
              }),
            ]
          : [];
      },
    },
  );
}

/** The package as a deployment installs it: no injected dependencies. */
const analyticsPackage: ServicePackageDefinition<typeof analyticsConfigSchema> =
  analyticsService();

export default analyticsPackage;

// Export types and schemas
export type {
  AnalyticsConfig,
  AnalyticsConfigInput,
  CloudflareConfig,
} from "./config";
export { analyticsConfigSchema, cloudflareConfigSchema } from "./config";
