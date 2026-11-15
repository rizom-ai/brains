import { describe, expect, it } from "bun:test";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import type {
  DashboardWidgetProviderContext,
  RuntimeDashboardWidgetData,
} from "@brains/plugins";
import type { ServiceRuntime } from "@brains/sdk/internal/service-runtime";
import { entitySnapshotStore } from "../../src/lib/traffic-capture";
import { trafficSnapshotAdapter } from "../../src/entity/adapter";
import type { TrafficDay } from "../../src/entity/schema";
import { analyticsRuntime, pluginsRegistered } from "../analytics-plugins";
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

interface Brain {
  readonly shell: MockShell;
  readonly runtime: ServiceRuntime;
}

async function brain(): Promise<Brain> {
  const shell = createMockShell();
  const runtime = await analyticsRuntime(shell);
  // This week 30, the week before 20.
  const days = [day("2026-10-02", 20), day("2026-10-09", 30)];
  const store = entitySnapshotStore(
    runtime.reportEntityService,
    runtime.entityWrites,
  );
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
  return { shell, runtime };
}

async function registered({ shell, runtime }: Brain): Promise<WidgetPayload> {
  let payload: WidgetPayload | undefined;
  shell
    .getMessageBus()
    .subscribe<WidgetPayload, { success: boolean }>(
      "dashboard:register-widget",
      async (message) => {
        payload = message.payload;
        return { success: true };
      },
    );
  registerTrafficWidget(runtime, createTrafficReports({ today: () => TODAY }));
  // A first-party service's widget registers once every plugin has.
  await pluginsRegistered(shell);
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

  it("captions each total with its change, not the total again", async () => {
    const payload = await registered(await brain());
    const data = await payload.dataProvider(owner);
    const stats = data.view.blocks.find((block) => block.type === "stats");
    if (stats?.type !== "stats") throw new Error("Missing totals");
    expect(stats.items).toContainEqual(
      expect.objectContaining({
        label: "Pageviews",
        value: 30,
        caption: "+50% on the period before",
      }),
    );
  });
});
