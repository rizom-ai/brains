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
import { TrafficCapture, entitySnapshotStore } from "./lib/traffic-capture";
import { TrafficSnapshotPlugin } from "./entity/plugin";
import { getErrorMessage } from "@brains/utils/error";
import packageJson from "../package.json";

/**
 * Analytics plugin for querying website metrics from Cloudflare
 *
 * Provides real-time access to Cloudflare Web Analytics data:
 * - Pageviews and visitors
 * - Top pages, referrers, countries
 * - Device breakdown
 *
 * Captures each day's traffic into weekly `traffic-snapshot` entities, and
 * contributes the Cloudflare beacon to site builds when a beacon token is set.
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

    // Daily, in the worker: yesterday's traffic while Cloudflare's counts are
    // exact, and on the first run every earlier day it still returns.
    if (this.cloudflareClient) {
      const capture = new TrafficCapture({
        client: this.cloudflareClient,
        store: entitySnapshotStore(context.entityService),
        today: (): string => new Date().toISOString().slice(0, 10),
      });
      context.recurringChecks.register({
        id: "traffic-capture",
        cadence: "daily",
        run: async ({ signal }) => {
          try {
            await capture.run(signal);
            return {};
          } catch (error) {
            if (signal.aborted) throw error;
            return {
              alerts: [
                {
                  dedupeKey: "traffic-capture-failed",
                  title: "Traffic capture failed",
                  body: `Yesterday's site traffic could not be saved: ${getErrorMessage(error)}. Cloudflare keeps exact counts for about a week, so the next successful run catches up.`,
                },
              ],
            };
          }
        },
      });
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
 * The analytics feature as a brain installs it: the traffic snapshot entity
 * and the service that captures and queries traffic.
 */
export function analyticsPlugin(
  config: AnalyticsConfigInput = {},
  deps: CloudflareClientDeps = {},
): [TrafficSnapshotPlugin, AnalyticsPlugin] {
  return [new TrafficSnapshotPlugin(), new AnalyticsPlugin(config, deps)];
}

export { TrafficSnapshotPlugin };
export { trafficSnapshotAdapter } from "./entity/adapter";
export {
  trafficSnapshotSchema,
  type TrafficDay,
  type TrafficSnapshot,
} from "./entity/schema";

// Export types and schemas
export type {
  AnalyticsConfig,
  AnalyticsConfigInput,
  CloudflareConfig,
} from "./config";
export { analyticsConfigSchema, cloudflareConfigSchema } from "./config";
