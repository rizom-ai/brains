import { siteHeadScriptsContract } from "@brains/contracts";
import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { serviceRuntime } from "@brains/sdk/internal/service-runtime";
import { getErrorMessage } from "@brains/utils/error";
import { analyticsConfigSchema } from "./config";
import { trafficSnapshotEntity } from "./entity/traffic-snapshot-entity";
import type { TrafficDay } from "./entity/schema";
import { generateCloudflareBeaconScript } from "./lib/beacon-script";
import {
  CloudflareClient,
  type CloudflareClientDeps,
} from "./lib/cloudflare-client";
import { TrafficCapture, entitySnapshotStore } from "./lib/traffic-capture";
import { createTrafficByEntityReport } from "./reports/traffic-by-entity";
import { createTrafficReports } from "./reports/traffic-reports";
import { registerTrafficWidget } from "./studio/traffic-widget";
import {
  registerTrafficWorkspace,
  type TrafficWorkspaceReports,
} from "./studio/traffic-workspace";

const utcToday = (): string => new Date().toISOString().slice(0, 10);

/** What the package holds once set up. */
export interface AnalyticsState {
  readonly reports: TrafficWorkspaceReports;
}

/** What analytics is built with: Cloudflare's transport, and a test's view of the state. */
export interface AnalyticsDeps extends CloudflareClientDeps {
  readonly onSetup?: ((state: AnalyticsState) => void) | undefined;
}

/**
 * Traffic analytics from Cloudflare Web Analytics, privacy-focused (no
 * cookies): each day's traffic captured into weekly `traffic-snapshot`
 * records, the traffic reports system_analytics answers, the Cloudflare
 * beacon in site builds when a beacon token is set, and the Studio Traffic
 * workspace and Dashboard widget.
 */
export function createAnalyticsPackage(
  deps: AnalyticsDeps = {},
): ServicePackageDefinition<typeof analyticsConfigSchema> {
  const { onSetup, ...clientDeps } = deps;
  return defineServicePlugin({
    id: "analytics",
    config: analyticsConfigSchema,
    entities: [trafficSnapshotEntity],
    setup: (context): AnalyticsState => {
      const runtime = serviceRuntime(context);
      const { config } = context;
      const client = config.cloudflare
        ? new CloudflareClient(config.cloudflare, clientDeps)
        : undefined;

      // Read from the snapshots; Cloudflare only adds today's numbers so far.
      const trafficDeps = {
        today: utcToday,
        ...(client && {
          liveDay: (date: string): Promise<TrafficDay> =>
            client.getDailyTraffic(date),
        }),
      };
      const reports: TrafficWorkspaceReports = {
        today: utcToday,
        ...createTrafficReports(trafficDeps),
        // Pages map to entities through the site's own routes.
        byEntity: createTrafficByEntityReport({
          ...trafficDeps,
          entityDisplay: runtime.entityDisplay,
        }),
      };
      runtime.analyticsReport(reports.overview);
      runtime.analyticsReport(reports.series);
      runtime.analyticsReport(reports.byEntity);

      // Site builds run in the worker and ask for head scripts as they
      // render, so the beacon answers there; that process never runs the
      // ready phase. Only with a beacon token: the beacon carries the site
      // token, not the site tag, and a zone with automatic setup gets it
      // from Cloudflare.
      const beaconToken = config.cloudflare?.beaconToken;
      if (beaconToken) {
        const script = generateCloudflareBeaconScript(beaconToken);
        runtime.answer(siteHeadScriptsContract, () => script, {
          everyProcess: true,
        });
      }

      // Daily, in the worker: yesterday's traffic while Cloudflare's counts
      // are exact, and on the first run every earlier day it still returns.
      if (client) {
        const capture = new TrafficCapture({
          client,
          store: entitySnapshotStore(
            runtime.reportEntityService,
            runtime.entityWrites,
          ),
          today: utcToday,
        });
        runtime.recurringCheck({
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

      registerTrafficWidget(runtime, reports);
      // Studio runs in the web process, which alone has a ready phase.
      let studioRegistered = false;
      runtime.ready(async () => {
        const url = await registerTrafficWorkspace(runtime, reports);
        studioRegistered = url !== undefined;
      });
      context.lifecycle.onCleanup(async () => {
        if (!studioRegistered) return;
        await runtime.studio.unregister("analytics:traffic");
        studioRegistered = false;
      });

      const state = { reports };
      onSetup?.(state);
      return state;
    },
  });
}
