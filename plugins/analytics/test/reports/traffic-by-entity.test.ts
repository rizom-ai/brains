import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { TrafficSnapshotPlugin } from "../../src/entity/plugin";
import { entitySnapshotStore } from "../../src/lib/traffic-capture";
import { trafficSnapshotAdapter } from "../../src/entity/adapter";
import { isoWeekOf } from "../../src/lib/iso-week";
import type { TrafficDay } from "../../src/entity/schema";
import { createTrafficByEntityReport } from "../../src/reports/traffic-by-entity";

const TODAY = "2026-10-12";

function day(
  date: string,
  paths: Array<[string, number]>,
  pathReferrers: Array<[string, string, number]> = [],
): TrafficDay {
  const pageviews = paths.reduce((total, [, count]) => total + count, 0);
  return {
    date,
    pageviews,
    visits: pageviews,
    estimated: false,
    paths: paths.map(([path, count]) => ({ path, pageviews: count })),
    referrers: [],
    pathReferrers: pathReferrers.map(([path, host, visits]) => ({
      path,
      host,
      visits,
    })),
    countries: [],
  };
}

type EntityService = ReturnType<
  ReturnType<
    ReturnType<typeof createPluginHarness>["getMockShell"]
  >["getEntityService"]
>;

/** A brain with traffic snapshots and the published work they point at. */
async function brainWith(days: TrafficDay[]): Promise<EntityService> {
  const harness = createPluginHarness();
  await harness.installPlugin(new TrafficSnapshotPlugin());
  const entityService = harness.getMockShell().getEntityService();
  const weeks = days.reduce((byWeek, d) => {
    const id = isoWeekOf(d.date).id;
    return byWeek.set(id, [...(byWeek.get(id) ?? []), d]);
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
  const work: Array<[string, string, Record<string, unknown>]> = [
    [
      "post",
      "a",
      { title: "Essay A", status: "published", publishedAt: "2026-10-08" },
    ],
    ["post", "b", { title: "Draft B", status: "draft" }],
    ["deck", "talk", { title: "The Talk", status: "published" }],
    ["post", "quiet", { title: "Quiet Essay", status: "published" }],
  ];
  for (const [entityType, id, metadata] of work) {
    await entityService.createEntity({
      entity: { id, entityType, content: id, metadata, visibility: "public" },
    });
  }
  return entityService;
}

const report = createTrafficByEntityReport({
  today: () => TODAY,
  entityDisplay: {
    post: { label: "Essay" },
    deck: { label: "Presentation" },
  },
});

async function run(
  entityService: EntityService,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return report.handler(report.params.parse(params), {
    entityService,
    visibilityScope: "restricted",
  });
}

const traffic = [
  day(
    "2026-10-08",
    [
      ["/essays/a", 10],
      ["/essays/b", 7],
      ["/", 20],
    ],
    [["/essays/a", "www.linkedin.com", 4]],
  ),
  day(
    "2026-10-09",
    [
      ["/essays/a", 5],
      ["/presentations/talk", 3],
    ],
    [["/essays/a", "www.linkedin.com", 1]],
  ),
  day("2026-10-11", [["/essays/a", 2]]),
];

describe("traffic-by-entity", () => {
  it("is the owner's report", () => {
    expect(report.type).toBe("traffic-by-entity");
    expect(report.minVisibility).toBe("admin");
  });

  it("counts each published piece's page, busiest first, drafts left out", async () => {
    const brain = await brainWith(traffic);

    expect(await run(brain, { days: 5 })).toMatchObject({
      range: { startDate: "2026-10-07", endDate: "2026-10-11" },
      entities: [
        {
          entityType: "post",
          id: "a",
          title: "Essay A",
          path: "/essays/a",
          pageviews: 17,
          referrers: [{ host: "www.linkedin.com", visits: 5 }],
        },
        {
          entityType: "deck",
          id: "talk",
          path: "/presentations/talk",
          pageviews: 3,
        },
        { entityType: "post", id: "quiet", pageviews: 0 },
      ],
    });
  });

  it("narrows to one type and to the limit", async () => {
    const brain = await brainWith(traffic);

    const result = await run(brain, { days: 5, entityType: "post", limit: 1 });
    expect(result["entities"]).toEqual([
      expect.objectContaining({ id: "a", pageviews: 17 }),
    ]);
  });

  it("counts a piece's first days after publishing, whatever the range", async () => {
    const brain = await brainWith(traffic);

    const result = await run(brain, {
      startDate: "2026-10-11",
      endDate: "2026-10-11",
      entityType: "post",
      firstDays: 2,
    });
    expect(result["entities"]).toContainEqual(
      expect.objectContaining({
        id: "a",
        pageviews: 2,
        firstDays: {
          days: 2,
          startDate: "2026-10-08",
          endDate: "2026-10-09",
          pageviews: 15,
        },
      }),
    );
  });

  it("refuses a type the site has no pages for", async () => {
    const brain = await brainWith(traffic);

    expect(run(brain, { entityType: "note" })).rejects.toThrow(/note/);
  });
});
