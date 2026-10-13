import { describe, expect, it } from "bun:test";
import {
  createMockShell,
  createServicePluginContext,
} from "@brains/plugins/test";
import type {
  DashboardWidgetProviderContext,
  RuntimeDashboardWidgetData,
  ServicePluginContext,
} from "@brains/plugins";
import { entitySnapshotStore } from "../../src/lib/traffic-capture";
import { trafficSnapshotAdapter } from "../../src/entity/adapter";
import {
  trafficSnapshotSchema,
  type TrafficDay,
} from "../../src/entity/schema";
import { isoWeekOf } from "../../src/lib/iso-week";
import { createTrafficReports } from "../../src/reports/traffic-reports";
import { registerTrafficWidget } from "../../src/studio/traffic-widget";

const TODAY = "2026-10-12";

interface WidgetPayload {
  id: string;
  title: string;
  visibility: string;
  dataProvider: (
    context: DashboardWidgetProviderContext,
  ) => Promise<RuntimeDashboardWidgetData>;
}

const owner: DashboardWidgetProviderContext = {
  caller: { actor: { id: "user:owner" }, permission: "admin", isAnchor: true },
  signal: new AbortController().signal,
};

function day(date: string, pageviews: number): TrafficDay {
  return {
    date,
    pageviews,
    visits: pageviews,
    estimated: false,
    paths: [],
    referrers: [],
    pathReferrers: [],
    countries: [],
  };
}

async function brain(): Promise<ServicePluginContext> {
  const context = createServicePluginContext(createMockShell(), "analytics");
  context.entities.register(
    "traffic-snapshot",
    trafficSnapshotSchema,
    trafficSnapshotAdapter,
  );
  // This week 30, the week before 20.
  const days = [day("2026-10-02", 20), day("2026-10-09", 30)];
  const store = entitySnapshotStore(context.entityService);
  for (const d of days) {
    const week = isoWeekOf(d.date);
    const frontmatter = {
      week: week.id,
      start: week.start,
      end: week.end,
      days: [d],
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
  return context;
}

async function registered(
  context: ServicePluginContext,
): Promise<WidgetPayload> {
  let payload: WidgetPayload | undefined;
  context.messaging.subscribe<WidgetPayload, { success: boolean }>(
    "dashboard:register-widget",
    async (message) => {
      payload = message.payload;
      return { success: true };
    },
  );
  await registerTrafficWidget(
    context,
    createTrafficReports({ today: () => TODAY }),
  );
  if (!payload) throw new Error("Widget was not registered");
  return payload;
}

describe("the Traffic dashboard widget", () => {
  it("is the owner's", async () => {
    const payload = await registered(await brain());
    expect(payload.title).toBe("Traffic");
    expect(payload.visibility).toBe("admin");
  });

  it("gives the last 7 days against the 7 before, and opens the Traffic workspace", async () => {
    const payload = await registered(await brain());
    const data = await payload.dataProvider(owner);

    expect(data.digest?.items).toContainEqual({
      label: "Pageviews, 7 days",
      value: "30 · +50%",
    });
    const view = JSON.stringify(data.view);
    expect(view).toContain('"type":"series"');
    expect(view).toContain('"target":"traffic"');
  });
});
