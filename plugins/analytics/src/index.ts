import type { ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import {
  analyticsConfigSchema,
  type AnalyticsConfig,
  type AnalyticsConfigInput,
} from "./config";
import { generateCloudflareBeaconScript } from "./lib/beacon-script";
import {
  CloudflareClient,
  type CloudflareClientDeps,
} from "./lib/cloudflare-client";
import { createTrafficReports } from "./reports/traffic-reports";
import { createTrafficByEntityReport } from "./reports/traffic-by-entity";
import {
  registerTrafficWorkspace,
  type TrafficWorkspaceReports,
} from "./studio/traffic-workspace";
import { registerTrafficWidget } from "./studio/traffic-widget";
import { TrafficCapture, entitySnapshotStore } from "./lib/traffic-capture";
import { TrafficSnapshotPlugin } from "./entity/plugin";
import type { TrafficDay } from "./entity/schema";
import { getErrorMessage } from "@brains/utils/error";
import packageJson from "../package.json";

const utcToday = (): string => new Date().toISOString().slice(0, 10);

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
  private trafficReports: TrafficWorkspaceReports | undefined;
  private pluginContext: ServicePluginContext | undefined;
  private studioRegistered = false;

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

    // Read from the snapshots; Cloudflare only adds today's numbers so far.
    const client = this.cloudflareClient;
    const trafficDeps = {
      today: utcToday,
      ...(client && {
        liveDay: (date: string): Promise<TrafficDay> =>
          client.getDailyTraffic(date),
      }),
    };
    const traffic = {
      today: utcToday,
      ...createTrafficReports(trafficDeps),
      // Pages map to entities through the site's own routes.
      byEntity: createTrafficByEntityReport({
        ...trafficDeps,
        entityDisplay: context.entityDisplay,
      }),
    };
    context.analytics.register(traffic.overview);
    context.analytics.register(traffic.series);
    context.analytics.register(traffic.byEntity);
    this.trafficReports = traffic;
    this.pluginContext = context;

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
        today: utcToday,
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

  // Studio runs in the web process, which alone has a ready phase.
  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    if (!this.trafficReports) return;
    const url = await registerTrafficWorkspace(context, this.trafficReports);
    this.studioRegistered = url !== undefined;
    await registerTrafficWidget(context, this.trafficReports);
  }

  protected override async onShutdown(): Promise<void> {
    if (!this.studioRegistered) return;
    await this.pluginContext?.studio.unregisterWorkspace("analytics:traffic");
    this.studioRegistered = false;
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
