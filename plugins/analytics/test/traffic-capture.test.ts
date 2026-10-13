import { describe, it, expect, spyOn } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { TrafficSnapshotPlugin } from "../src/entity/plugin";
import {
  entitySnapshotStore,
  TrafficCapture,
  type TrafficCaptureClient,
  type TrafficSnapshotStore,
} from "../src/lib/traffic-capture";
import { trafficSnapshotAdapter } from "../src/entity/adapter";
import type { TrafficDay, TrafficSnapshot } from "../src/entity/schema";

const day = (
  date: string,
  pageviews: number,
  estimated = false,
): TrafficDay => ({
  date,
  pageviews,
  visits: Math.round(pageviews / 2),
  estimated,
  paths: [],
  referrers: [],
  pathReferrers: [],
  countries: [],
});

function fakeClient(
  createdAt: string | null,
  readings: Record<string, TrafficDay> = {},
): TrafficCaptureClient & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    getSiteCreatedAt: async () => createdAt,
    getDailyTraffic: async (date): Promise<TrafficDay> => {
      asked.push(date);
      return readings[date] ?? day(date, 10);
    },
  };
}

function memoryStore(): TrafficSnapshotStore & {
  snapshots: Map<string, TrafficSnapshot>;
} {
  const snapshots = new Map<string, TrafficSnapshot>();
  return {
    snapshots,
    list: async () => [...snapshots.values()],
    save: async (snapshot): Promise<void> => {
      snapshots.set(snapshot.id, snapshot);
    },
  };
}

const daysIn = (snapshot: TrafficSnapshot | undefined): TrafficDay[] =>
  snapshot ? trafficSnapshotAdapter.parseContent(snapshot.content).days : [];

const signal = new AbortController().signal;

describe("TrafficCapture", () => {
  it("backfills every day from the site's creation to yesterday, one snapshot per week", async () => {
    const client = fakeClient("2026-10-01");
    const store = memoryStore();

    await new TrafficCapture({
      client,
      store,
      today: (): string => "2026-10-10",
    }).run(signal);

    expect([...client.asked].sort()).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
    ]);
    expect([...store.snapshots.keys()].sort()).toEqual([
      "2026-W40",
      "2026-W41",
    ]);
    const w41 = store.snapshots.get("2026-W41");
    expect(w41).toMatchObject({
      entityType: "traffic-snapshot",
      visibility: "restricted",
      metadata: {
        title: "Traffic 2026-W41",
        week: "2026-W41",
        start: "2026-10-05",
        end: "2026-10-11",
        pageviews: 50,
      },
    });
    expect(daysIn(w41).map((d) => d.date)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
    ]);
  });

  it("then fetches only missing days plus the last three", async () => {
    const store = memoryStore();
    await new TrafficCapture({
      client: fakeClient("2026-10-01"),
      store,
      today: (): string => "2026-10-10",
    }).run(signal);

    const client = fakeClient("2026-10-01");
    await new TrafficCapture({
      client,
      store,
      today: (): string => "2026-10-11",
    }).run(signal);

    expect([...client.asked].sort()).toEqual([
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
    ]);
    expect(
      daysIn(store.snapshots.get("2026-W41")).map((d) => d.date),
    ).toContain("2026-10-10");
  });

  it("keeps a counted day over a later sampled reading", async () => {
    const store = memoryStore();
    await new TrafficCapture({
      client: fakeClient("2026-10-08", { "2026-10-08": day("2026-10-08", 50) }),
      store,
      today: (): string => "2026-10-09",
    }).run(signal);

    await new TrafficCapture({
      client: fakeClient("2026-10-08", {
        "2026-10-08": day("2026-10-08", 70, true),
      }),
      store,
      today: (): string => "2026-10-10",
    }).run(signal);

    expect(daysIn(store.snapshots.get("2026-W41"))[0]).toMatchObject({
      date: "2026-10-08",
      pageviews: 50,
      estimated: false,
    });
  });

  it("replaces an estimate with a later counted reading", async () => {
    const store = memoryStore();
    await new TrafficCapture({
      client: fakeClient("2026-10-08", {
        "2026-10-08": day("2026-10-08", 70, true),
      }),
      store,
      today: (): string => "2026-10-09",
    }).run(signal);

    await new TrafficCapture({
      client: fakeClient("2026-10-08", { "2026-10-08": day("2026-10-08", 64) }),
      store,
      today: (): string => "2026-10-10",
    }).run(signal);

    expect(daysIn(store.snapshots.get("2026-W41"))[0]).toMatchObject({
      pageviews: 64,
      estimated: false,
    });
  });

  it("reaches back no further than Cloudflare keeps data", async () => {
    const client = fakeClient("2025-01-01");

    await new TrafficCapture({
      client,
      store: memoryStore(),
      today: (): string => "2026-10-10",
    }).run(signal);

    expect([...client.asked].sort()[0]).toBe("2026-04-13");
    expect(client.asked).toHaveLength(180);
  });

  it("falls back to that limit when the site is not listed", async () => {
    const client = fakeClient(null);

    await new TrafficCapture({
      client,
      store: memoryStore(),
      today: (): string => "2026-10-10",
    }).run(signal);

    expect([...client.asked].sort()[0]).toBe("2026-04-13");
  });

  it("stops before fetching when cancelled", async () => {
    const client = fakeClient("2026-10-01");
    const cancelled = new AbortController();
    cancelled.abort();

    expect(
      new TrafficCapture({
        client,
        store: memoryStore(),
        today: (): string => "2026-10-10",
      }).run(cancelled.signal),
    ).rejects.toThrow();
    expect(client.asked).toEqual([]);
  });
});

describe("entitySnapshotStore", () => {
  async function snapshotService(): Promise<
    ReturnType<
      ReturnType<
        ReturnType<typeof createPluginHarness>["getMockShell"]
      >["getEntityService"]
    >
  > {
    const harness = createPluginHarness();
    await harness.installPlugin(new TrafficSnapshotPlugin());
    return harness.getMockShell().getEntityService();
  }

  // An unscoped read fails closed to public in the real entity service and
  // would never find a restricted snapshot.
  it("reads snapshots with the restricted scope", async () => {
    const entityService = await snapshotService();
    const list = spyOn(entityService, "listEntities");

    await entitySnapshotStore(entityService).list();

    expect(list.mock.calls[0]?.[0]).toMatchObject({
      entityType: "traffic-snapshot",
      options: { filter: { visibilityScope: "restricted" } },
    });
  });

  it("saves a snapshot and lists it back", async () => {
    const entityService = await snapshotService();
    const store = entitySnapshotStore(entityService);
    await new TrafficCapture({
      client: fakeClient("2026-10-08"),
      store,
      today: (): string => "2026-10-10",
    }).run(signal);

    const snapshots = await store.list();

    expect(snapshots.map((s) => s.id)).toEqual(["2026-W41"]);
    expect(daysIn(snapshots[0]).map((d) => d.date)).toEqual([
      "2026-10-08",
      "2026-10-09",
    ]);
  });
});
