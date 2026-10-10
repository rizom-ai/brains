import { describe, it, expect, spyOn } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type { ServicePluginContext } from "@brains/plugins";
import {
  AnalyticsPlugin,
  analyticsPlugin,
  type AnalyticsConfigInput,
} from "../src/index";
import { TrafficSnapshotPlugin } from "../src/entity/plugin";
import type { CloudflareFetch } from "../src/lib/cloudflare-client";
import { addDays } from "../src/lib/iso-week";
import { trafficSnapshotAdapter } from "../src/entity/adapter";
import { trafficSnapshotSchema } from "../src/entity/schema";

type RecurringCheckDefinition = Parameters<
  ServicePluginContext["recurringChecks"]["register"]
>[0];

const cloudflare = {
  accountId: "acct",
  apiToken: "token",
  siteTag: "site",
};

/** Register analytics in a worker-mode process and keep the checks it registers. */
async function checksInWorker(
  config: AnalyticsConfigInput,
  fetch?: CloudflareFetch,
): Promise<{
  checks: RecurringCheckDefinition[];
  harness: ReturnType<typeof createPluginHarness>;
}> {
  const harness = createPluginHarness();
  const shell = harness.getMockShell();
  const checks: RecurringCheckDefinition[] = [];
  spyOn(shell, "getRecurringChecks").mockReturnValue({
    register: (check) => {
      checks.push(check);
      return (): void => {};
    },
  });
  await harness.installPlugin(new TrafficSnapshotPlugin());
  await new AnalyticsPlugin(config, fetch ? { fetch } : {}).register(shell, {
    executionOnly: true,
  });
  return { checks, harness };
}

const json = (body: unknown): ReturnType<CloudflareFetch> =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

describe("traffic capture registration", () => {
  it("registers a daily capture in the worker process", async () => {
    const { checks } = await checksInWorker({ cloudflare });

    expect(checks.map((c) => [c.id, c.cadence])).toEqual([
      ["traffic-capture", "daily"],
    ]);
  });

  it("registers nothing without Cloudflare", async () => {
    const { checks } = await checksInWorker({});

    expect(checks).toEqual([]);
  });

  it("raises an alert when the capture fails", async () => {
    const { checks } = await checksInWorker({ cloudflare }, () =>
      Promise.resolve(new Response("Forbidden", { status: 403 })),
    );

    const result = await checks[0]?.run({
      signal: new AbortController().signal,
    });

    expect(result?.alerts).toEqual([
      expect.objectContaining({
        dedupeKey: "traffic-capture-failed",
        title: "Traffic capture failed",
      }),
    ]);
  });

  it("writes snapshots when the capture runs", async () => {
    const created = addDays(new Date().toISOString().slice(0, 10), -3);
    const { checks, harness } = await checksInWorker({ cloudflare }, (url) =>
      url.includes("site_info")
        ? json({
            success: true,
            result: [{ site_tag: "site", created: `${created}T00:00:00Z` }],
          })
        : json({
            data: {
              viewer: {
                accounts: [
                  {
                    total: [
                      {
                        count: 7,
                        sum: { visits: 3 },
                        avg: { sampleInterval: 1 },
                      },
                    ],
                    paths: [],
                    referrers: [],
                    pathReferrers: [],
                    countries: [],
                  },
                ],
              },
            },
            errors: null,
          }),
    );

    expect(
      await checks[0]?.run({ signal: new AbortController().signal }),
    ).toEqual({});

    const snapshots = await harness
      .getMockShell()
      .getEntityService()
      .listEntities(
        {
          entityType: "traffic-snapshot",
          options: { filter: { visibilityScope: "restricted" } },
        },
        trafficSnapshotSchema,
      );
    const days = snapshots.flatMap(
      (s) => trafficSnapshotAdapter.parseContent(s.content).days,
    );
    expect(days.map((d) => d.date).sort()).toEqual([
      created,
      addDays(created, 1),
      addDays(created, 2),
    ]);
    expect(days.every((d) => d.pageviews === 7)).toBe(true);
  });
});

describe("analyticsPlugin", () => {
  it("brings the snapshot entity with the service", () => {
    const plugins = analyticsPlugin({ cloudflare });

    expect(plugins.map((p) => p.constructor.name)).toEqual([
      "TrafficSnapshotPlugin",
      "AnalyticsPlugin",
    ]);
  });
});
