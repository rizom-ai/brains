import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type {
  AnalyticsReportDefinition,
  ContentVisibility,
} from "@brains/plugins";
import type { z } from "@brains/utils/zod";
import { TrafficSnapshotPlugin } from "../../src/entity/plugin";
import { entitySnapshotStore } from "../../src/lib/traffic-capture";
import { trafficSnapshotAdapter } from "../../src/entity/adapter";
import { isoWeekOf } from "../../src/lib/iso-week";
import type { TrafficDay } from "../../src/entity/schema";
import {
  createTrafficReports,
  type TrafficReports,
  type TrafficReportsDeps,
} from "../../src/reports/traffic-reports";

const TODAY = "2026-10-12";

function day(
  date: string,
  pageviews: number,
  extra: Partial<TrafficDay> = {},
): TrafficDay {
  return {
    date,
    pageviews,
    visits: Math.round(pageviews / 2),
    estimated: false,
    paths: [],
    referrers: [],
    pathReferrers: [],
    countries: [],
    ...extra,
  };
}

type EntityService = ReturnType<
  ReturnType<
    ReturnType<typeof createPluginHarness>["getMockShell"]
  >["getEntityService"]
>;

/** Stores the days as the capture would: one snapshot per ISO week. */
async function brainWith(days: TrafficDay[]): Promise<EntityService> {
  const harness = createPluginHarness();
  await harness.installPlugin(new TrafficSnapshotPlugin());
  const entityService = harness.getMockShell().getEntityService();
  const weeks = days.reduce((byWeek, d) => {
    const id = isoWeekOf(d.date).id;
    byWeek.set(id, [...(byWeek.get(id) ?? []), d]);
    return byWeek;
  }, new Map<string, TrafficDay[]>());
  const store = entitySnapshotStore(entityService);
  for (const [id, weekDays] of weeks) {
    const week = isoWeekOf(weekDays[0]?.date ?? TODAY);
    const frontmatter = {
      week: id,
      start: week.start,
      end: week.end,
      days: weekDays,
    };
    await store.save({
      id,
      entityType: "traffic-snapshot",
      visibility: "restricted",
      content: trafficSnapshotAdapter.createContent(frontmatter),
      metadata: trafficSnapshotAdapter.metadataFor(frontmatter),
      contentHash: "",
      created: `${TODAY}T00:00:00.000Z`,
      updated: `${TODAY}T00:00:00.000Z`,
    });
  }
  return entityService;
}

function reports(deps: Partial<TrafficReportsDeps> = {}): TrafficReports {
  return createTrafficReports({ today: () => TODAY, ...deps });
}

async function run<TParams extends z.ZodObject>(
  report: AnalyticsReportDefinition<TParams>,
  entityService: EntityService,
  params: Record<string, unknown> = {},
  visibilityScope: ContentVisibility = "restricted",
): Promise<Record<string, unknown>> {
  return report.handler(report.params.parse(params), {
    entityService,
    visibilityScope,
  });
}

describe("traffic reports", () => {
  it("are the owner's: both answer admin callers only", () => {
    const { overview, series } = reports();
    expect(overview.type).toBe("traffic-overview");
    expect(series.type).toBe("traffic-series");
    expect(overview.minVisibility).toBe("admin");
    expect(series.minVisibility).toBe("admin");
  });

  describe("traffic-overview", () => {
    it("totals the last days from the snapshots, against the period before", async () => {
      const brain = await brainWith([
        day("2026-10-08", 10),
        day("2026-10-09", 30),
        day("2026-10-10", 20),
        day("2026-10-11", 40),
        // the two days before
        day("2026-10-06", 20),
        day("2026-10-07", 30),
      ]);

      expect(await run(reports().overview, brain, { days: 2 })).toMatchObject({
        range: { startDate: "2026-10-10", endDate: "2026-10-11", days: 2 },
        pageviews: 60,
        visits: 30,
        previous: {
          startDate: "2026-10-08",
          endDate: "2026-10-09",
          pageviews: 40,
        },
        change: { pageviews: 50 },
        missingDays: [],
        estimated: false,
      });
    });

    it("lists top pages without the owner's own pages, which it counts apart", async () => {
      const brain = await brainWith([
        day("2026-10-11", 30, {
          paths: [
            { path: "/studio/entities/post", pageviews: 9 },
            { path: "/essays/one", pageviews: 8 },
            { path: "/login", pageviews: 3 },
            { path: "/", pageviews: 6 },
            { path: "/api/chat", pageviews: 2 },
            { path: "/cms/workspaces/site", pageviews: 7 },
          ],
          referrers: [{ host: "www.linkedin.com", visits: 4 }],
          countries: [{ country: "TW", visits: 5 }],
        }),
        day("2026-10-10", 10, {
          paths: [{ path: "/essays/one", pageviews: 4 }],
          referrers: [{ host: "www.linkedin.com", visits: 1 }],
          countries: [{ country: "NL", visits: 2 }],
        }),
      ]);

      const result = await run(reports().overview, brain, {
        days: 2,
        limit: 2,
      });
      expect(result["topPaths"]).toEqual([
        { path: "/essays/one", pageviews: 12 },
        { path: "/", pageviews: 6 },
      ]);
      expect(result["ownerPageviews"]).toBe(21);
      expect(result["referrers"]).toEqual([
        { host: "www.linkedin.com", visits: 5 },
      ]);
      expect(result["countries"]).toEqual([
        { country: "TW", visits: 5 },
        { country: "NL", visits: 2 },
      ]);
    });

    it("names the days it has no snapshot for, and says when counts were sampled", async () => {
      const brain = await brainWith([
        day("2026-10-09", 10, { estimated: true }),
        day("2026-10-11", 10),
      ]);

      expect(
        await run(reports().overview, brain, {
          startDate: "2026-10-09",
          endDate: "2026-10-11",
        }),
      ).toMatchObject({
        range: { startDate: "2026-10-09", endDate: "2026-10-11", days: 3 },
        pageviews: 20,
        missingDays: ["2026-10-10"],
        estimated: true,
      });
    });

    it("adds today's numbers so far when the range reaches today", async () => {
      const brain = await brainWith([day("2026-10-11", 10)]);
      const live = async (date: string): Promise<TrafficDay> => day(date, 5);

      expect(
        await run(reports({ liveDay: live }).overview, brain, {
          startDate: "2026-10-11",
          endDate: TODAY,
        }),
      ).toMatchObject({ pageviews: 15, today: "partial", missingDays: [] });
      expect(
        await run(reports().overview, brain, {
          startDate: "2026-10-11",
          endDate: TODAY,
        }),
      ).toMatchObject({ pageviews: 10, today: "unavailable" });
    });

    it("takes a date range only as a pair", () => {
      const { overview } = reports();
      expect(
        overview.params.safeParse({ startDate: "2026-10-01" }).success,
      ).toBe(false);
    });
  });

  describe("traffic-series", () => {
    it("gives every day in the range, missing ones without numbers", async () => {
      const brain = await brainWith([
        day("2026-10-09", 10),
        day("2026-10-11", 30),
      ]);

      expect(await run(reports().series, brain, { days: 3 })).toMatchObject({
        interval: "day",
        points: [
          { period: "2026-10-09", pageviews: 10, visits: 5 },
          { period: "2026-10-10", pageviews: null, visits: null },
          { period: "2026-10-11", pageviews: 30, visits: 15 },
        ],
      });
    });

    it("sums ISO weeks when asked for weeks", async () => {
      const brain = await brainWith([
        day("2026-10-04", 4),
        day("2026-10-05", 10),
        day("2026-10-06", 20),
      ]);

      expect(
        await run(reports().series, brain, {
          startDate: "2026-10-04",
          endDate: "2026-10-06",
          interval: "week",
        }),
      ).toMatchObject({
        interval: "week",
        points: [
          { period: "2026-W40", pageviews: 4, days: 1 },
          { period: "2026-W41", pageviews: 30, days: 2 },
        ],
      });
    });
  });
});
