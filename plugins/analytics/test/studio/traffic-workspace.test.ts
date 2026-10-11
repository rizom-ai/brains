import { describe, expect, it } from "bun:test";
import {
  baseEntitySchema,
  createMockShell,
  createServicePluginContext,
  createTestEntityAdapter,
} from "@brains/plugins/test";
import type {
  ServicePluginContext,
  StudioWorkspaceActor,
  StudioWorkspaceRegistration,
} from "@brains/plugins";
import { entitySnapshotStore } from "../../src/lib/traffic-capture";
import { trafficSnapshotAdapter } from "../../src/entity/adapter";
import { trafficSnapshotSchema } from "../../src/entity/schema";
import type { TrafficDay } from "../../src/entity/schema";
import { isoWeekOf } from "../../src/lib/iso-week";
import { createTrafficReports } from "../../src/reports/traffic-reports";
import { createTrafficByEntityReport } from "../../src/reports/traffic-by-entity";
import { registerTrafficWorkspace } from "../../src/studio/traffic-workspace";

const TODAY = "2026-10-12";

const adminActor: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "owner",
  actor: { kind: "user", userId: "owner" },
  userPermissionLevel: "admin",
  visibilityScope: "restricted",
  isAnchor: true,
};

function day(
  date: string,
  paths: Array<[string, number]>,
  referrers: Array<[string, number]> = [],
): TrafficDay {
  const pageviews = paths.reduce((total, [, count]) => total + count, 0);
  return {
    date,
    pageviews,
    visits: Math.ceil(pageviews / 2),
    estimated: false,
    paths: paths.map(([path, count]) => ({ path, pageviews: count })),
    referrers: referrers.map(([host, visits]) => ({ host, visits })),
    pathReferrers: [],
    countries: [{ country: "TW", visits: 3 }],
  };
}

async function brain(): Promise<ServicePluginContext> {
  const context = createServicePluginContext(createMockShell(), "analytics");
  context.entities.register(
    "traffic-snapshot",
    trafficSnapshotSchema,
    trafficSnapshotAdapter,
  );
  context.entities.register(
    "post",
    baseEntitySchema,
    createTestEntityAdapter("post"),
  );
  const days = [
    day(
      "2026-10-09",
      [
        ["/essays/a", 30],
        ["/", 6],
        ["/studio", 4],
      ],
      [["www.linkedin.com", 5]],
    ),
    day("2026-10-11", [["/essays/a", 4]]),
  ];
  const store = entitySnapshotStore(context.entityService);
  for (const d of days) {
    const week = isoWeekOf(d.date);
    const frontmatter = {
      week: week.id,
      start: week.start,
      end: week.end,
      days: days.filter((other) => isoWeekOf(other.date).id === week.id),
    };
    await store.save({
      id: week.id,
      entityType: "traffic-snapshot",
      visibility: "restricted",
      content: trafficSnapshotAdapter.createContent(frontmatter),
      metadata: trafficSnapshotAdapter.metadataFor(frontmatter),
      contentHash: "",
      created: `${TODAY}T00:00:00.000Z`,
      updated: `${TODAY}T00:00:00.000Z`,
    });
  }
  await context.entityService.createEntity({
    entity: {
      id: "a",
      entityType: "post",
      content: "a",
      visibility: "public",
      metadata: {
        title: "Essay A",
        status: "published",
        publishedAt: "2026-10-09T06:00:00.000Z",
      },
    },
  });
  return context;
}

async function registered(
  context: ServicePluginContext,
): Promise<StudioWorkspaceRegistration> {
  let registration: StudioWorkspaceRegistration | undefined;
  context.messaging.subscribe<
    StudioWorkspaceRegistration,
    { workspaceUrl: string }
  >("studio:register-workspace", async (message) => {
    registration = message.payload;
    return {
      success: true,
      data: { workspaceUrl: "/studio/workspaces/analytics%3Atraffic" },
    };
  });
  const deps = { today: (): string => TODAY };
  const { overview, series } = createTrafficReports(deps);
  await registerTrafficWorkspace(context, {
    today: deps.today,
    overview,
    series,
    byEntity: createTrafficByEntityReport({
      ...deps,
      entityDisplay: { post: { label: "Essay" } },
    }),
  });
  if (!registration) throw new Error("Workspace was not registered");
  return registration;
}

describe("the Traffic workspace", () => {
  it("is the owner's Studio workspace", async () => {
    const registration = await registered(await brain());
    expect(registration.id).toBe("analytics:traffic");
    expect(registration.label).toBe("Traffic");
    expect(registration.permission).toBe("admin");
  });

  it("shows the period's figures, the daily chart with publishing marked, and what drew readers", async () => {
    const registration = await registered(await brain());
    const view = JSON.stringify(await registration.dataProvider(adminActor));

    expect(view).toContain('"type":"series"');
    expect(view).toContain('"marker":"Published: Essay A"');
    expect(view).toContain('"label":"Pageviews"');
    expect(view).toContain('"title":"Essay A"');
    expect(view).toContain('"entityType":"post"');
    expect(view).toContain('"title":"www.linkedin.com"');
    // The owner's own pages are not what readers read.
    expect(view).not.toContain('"title":"/studio"');
  });

  it("covers the range the owner picks", async () => {
    const registration = await registered(await brain());
    const week = JSON.stringify(
      await registration.dataProvider(adminActor, { days: "7" }),
    );
    const month = JSON.stringify(await registration.dataProvider(adminActor));

    expect(week).toContain('"value":"7"');
    expect(week).toContain('"id":"2026-10-05"');
    expect(week).not.toContain('"id":"2026-10-04"');
    expect(month).toContain('"value":"30"');
    expect(month).toContain('"id":"2026-09-12"');
  });

  // Studio's period select always offers "All" (an empty value): it covers
  // every day the snapshots hold, and an unknown value reads as the default.
  it("covers every recorded day for All, and the default for anything else", async () => {
    const registration = await registered(await brain());
    const all = JSON.stringify(
      await registration.dataProvider(adminActor, { days: "" }),
    );
    const bogus = JSON.stringify(
      await registration.dataProvider(adminActor, { days: "all" }),
    );

    expect(all).toContain('"allLabel":"All recorded days"');
    expect(all).toContain('"description":"9 Oct – 11 Oct"');
    expect(all).toContain('"id":"2026-10-09"');
    expect(all).not.toContain('"id":"2026-10-08"');
    expect(bogus).toContain('"value":"30"');
    expect(bogus).toContain('"id":"2026-09-12"');
  });
});
