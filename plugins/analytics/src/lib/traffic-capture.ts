import type { ServicePluginContext } from "@brains/plugins";
import { computeContentHash } from "@brains/utils/hash";
import { trafficSnapshotAdapter } from "../entity/adapter";
import {
  trafficSnapshotSchema,
  type TrafficDay,
  type TrafficSnapshot,
} from "../entity/schema";
import type { CloudflareClient } from "./cloudflare-client";
import { addDays, datesBetween, isoWeekOf } from "./iso-week";

/**
 * How far back Cloudflare still returns a day. yeehaa.io's first day sat at
 * 180 days when this was measured; reaching further would store days that
 * have aged out as days without traffic.
 */
const RETENTION_DAYS = 180;

/** Recent days are read again: late page loads and a missed run land there. */
const REFRESH_DAYS = 3;

/** Requests in flight at once, to stay well inside Cloudflare's rate limits. */
const CONCURRENCY = 4;

export type TrafficCaptureClient = Pick<
  CloudflareClient,
  "getDailyTraffic" | "getSiteCreatedAt"
>;

/** Where snapshots live: the brain's entities, or memory in a test. */
export interface TrafficSnapshotStore {
  list(): Promise<TrafficSnapshot[]>;
  save(snapshot: TrafficSnapshot): Promise<void>;
}

export interface TrafficCaptureDeps {
  client: TrafficCaptureClient;
  store: TrafficSnapshotStore;
  /** Today's UTC date, `YYYY-MM-DD`. */
  today: () => string;
  now?: () => Date;
}

/**
 * Snapshots in the brain's entities. Reads pass the restricted scope
 * explicitly: an unscoped read fails closed to public and would never find
 * the snapshots, so every run would fetch everything again.
 */
export function entitySnapshotStore(
  entityService: Pick<
    ServicePluginContext["entityService"],
    "listEntities" | "upsertEntity"
  >,
): TrafficSnapshotStore {
  return {
    list: () =>
      entityService.listEntities(
        {
          entityType: "traffic-snapshot",
          options: { limit: 10_000, filter: { visibilityScope: "restricted" } },
        },
        trafficSnapshotSchema,
      ),
    save: async (snapshot): Promise<void> => {
      await entityService.upsertEntity({ entity: snapshot });
    },
  };
}

/** A stored counted day is never replaced by a sampled one. */
function keepBetter(
  stored: TrafficDay | undefined,
  fresh: TrafficDay,
): TrafficDay {
  return stored && !stored.estimated && fresh.estimated ? stored : fresh;
}

/**
 * Captures daily traffic into weekly snapshots: every day missing between
 * the site's first day (or Cloudflare's retention) and yesterday, plus the
 * last few days again. The first run is the backfill; an interrupted run
 * resumes on the next.
 */
export class TrafficCapture {
  private readonly deps: TrafficCaptureDeps;

  constructor(deps: TrafficCaptureDeps) {
    this.deps = deps;
  }

  async run(signal: AbortSignal): Promise<{ captured: string[] }> {
    signal.throwIfAborted();
    const { client, store, today } = this.deps;
    const yesterday = addDays(today(), -1);
    const retained = addDays(today(), -RETENTION_DAYS);
    const created = await client.getSiteCreatedAt();
    const earliest = created && created > retained ? created : retained;

    const snapshots = await store.list();
    const stored = new Map(
      snapshots.flatMap((snapshot) =>
        trafficSnapshotAdapter
          .parseContent(snapshot.content)
          .days.map((d) => [d.date, d] as const),
      ),
    );
    const refreshFrom = addDays(yesterday, -(REFRESH_DAYS - 1));
    const dates = datesBetween(earliest, yesterday).filter(
      (date) => !stored.has(date) || date >= refreshFrom,
    );

    const batches = Array.from(
      { length: Math.ceil(dates.length / CONCURRENCY) },
      (_, i) => dates.slice(i * CONCURRENCY, (i + 1) * CONCURRENCY),
    );
    const fetched = await batches.reduce<Promise<TrafficDay[]>>(
      async (acc, batch) => {
        const done = await acc;
        signal.throwIfAborted();
        return [
          ...done,
          ...(await Promise.all(batch.map((d) => client.getDailyTraffic(d)))),
        ];
      },
      Promise.resolve([]),
    );

    const fresh = fetched.map((d) => keepBetter(stored.get(d.date), d));
    const byWeek = fresh.reduce((weeks, d) => {
      const id = isoWeekOf(d.date).id;
      weeks.set(id, [...(weeks.get(id) ?? []), d]);
      return weeks;
    }, new Map<string, TrafficDay[]>());
    const existing = new Map(snapshots.map((s) => [s.id, s]));
    await Array.from(byWeek.values()).reduce<Promise<void>>(
      async (acc, days) => {
        await acc;
        const first = days[0];
        if (first) await this.saveWeek(first.date, days, existing, stored);
      },
      Promise.resolve(),
    );

    return { captured: fetched.map((d) => d.date) };
  }

  private async saveWeek(
    anyDate: string,
    freshDays: TrafficDay[],
    existing: Map<string, TrafficSnapshot>,
    stored: Map<string, TrafficDay>,
  ): Promise<void> {
    const week = isoWeekOf(anyDate);
    const merged = new Map(
      datesBetween(week.start, week.end).flatMap((date) => {
        const day = stored.get(date);
        return day ? [[date, day] as const] : [];
      }),
    );
    freshDays.forEach((d) => merged.set(d.date, d));
    const frontmatter = {
      week: week.id,
      start: week.start,
      end: week.end,
      days: [...merged.values()].sort((a, b) => a.date.localeCompare(b.date)),
    };
    const content = trafficSnapshotAdapter.createContent(frontmatter);
    const contentHash = computeContentHash(content);
    const prior = existing.get(week.id);
    if (prior?.contentHash === contentHash) return;

    const now = (this.deps.now ?? ((): Date => new Date()))().toISOString();
    await this.deps.store.save({
      id: week.id,
      entityType: "traffic-snapshot",
      content,
      contentHash,
      created: prior?.created ?? now,
      updated: now,
      visibility: "restricted",
      metadata: trafficSnapshotAdapter.metadataFor(frontmatter),
    });
  }
}
