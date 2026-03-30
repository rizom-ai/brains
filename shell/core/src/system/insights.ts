import type { ICoreEntityService, BaseEntity } from "@brains/entity-service";
import type { IInsightsRegistry, InsightHandler } from "@brains/plugins";

interface CadenceEntry {
  month: string;
  counts: Record<string, number>;
  total: number;
}

interface DraftEntry {
  id: string;
  entityType: string;
  title: string;
  created: string;
}

interface StaleEntry {
  id: string;
  entityType: string;
  title: string;
  updated: string;
  daysSinceUpdate: number;
}

/**
 * Registry for insight types.
 * Core registers generic insights; plugins register domain-specific ones.
 */
export class InsightsRegistry implements IInsightsRegistry {
  private handlers = new Map<string, InsightHandler>();

  register(type: string, handler: InsightHandler): void {
    this.handlers.set(type, handler);
  }

  getTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  async get(
    type: string,
    entityService: ICoreEntityService,
  ): Promise<Record<string, unknown>> {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(
        `Unknown insight type: ${type}. Available: ${this.getTypes().join(", ")}`,
      );
    }
    return handler(entityService);
  }
}

/**
 * Create an InsightsRegistry with the built-in generic insights.
 */
export function createInsightsRegistry(): InsightsRegistry {
  const registry = new InsightsRegistry();

  registry.register("overview", getOverview);
  registry.register("publishing-cadence", getPublishingCadence);
  registry.register("content-health", getContentHealth);

  return registry;
}

// ── Built-in insight handlers (entity-type agnostic) ──

async function getOverview(
  entityService: ICoreEntityService,
): Promise<Record<string, unknown>> {
  const counts = await entityService.getEntityCounts();
  const entityCounts: Record<string, number> = {};
  let totalEntities = 0;
  for (const { entityType, count } of counts) {
    entityCounts[entityType] = count;
    totalEntities += count;
  }

  const allEntities = await getAllEntities(entityService);
  const now = Date.now();
  const day7 = now - 7 * 24 * 60 * 60 * 1000;
  const day30 = now - 30 * 24 * 60 * 60 * 1000;

  let last7days = 0;
  let last30days = 0;
  for (const entity of allEntities) {
    const created = new Date(entity.created).getTime();
    if (created >= day7) last7days++;
    if (created >= day30) last30days++;
  }

  const drafts = getDrafts(allEntities);
  const published = allEntities.filter(
    (e) => e.metadata["status"] === "published",
  );

  return {
    entityCounts,
    totalEntities,
    recentActivity: { last7days, last30days },
    contentHealth: {
      drafts: drafts.length,
      published: published.length,
    },
  };
}

async function getPublishingCadence(
  entityService: ICoreEntityService,
): Promise<Record<string, unknown>> {
  const allEntities = await getAllEntities(entityService);
  const monthMap = new Map<string, Record<string, number>>();

  for (const entity of allEntities) {
    const date = new Date(entity.created);
    if (isNaN(date.getTime())) continue;

    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    let counts = monthMap.get(month);
    if (!counts) {
      counts = {};
      monthMap.set(month, counts);
    }
    counts[entity.entityType] = (counts[entity.entityType] ?? 0) + 1;
  }

  const months: CadenceEntry[] = Array.from(monthMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, counts]) => {
      let total = 0;
      for (const v of Object.values(counts)) total += v;
      return { month, counts, total };
    });

  return { months };
}

async function getContentHealth(
  entityService: ICoreEntityService,
): Promise<Record<string, unknown>> {
  const allEntities = await getAllEntities(entityService);

  const drafts: DraftEntry[] = getDrafts(allEntities).map((e) => ({
    id: e.id,
    entityType: e.entityType,
    title: typeof e.metadata["title"] === "string" ? e.metadata["title"] : e.id,
    created: e.created,
  }));

  const now = Date.now();
  const staleThreshold = now - 90 * 24 * 60 * 60 * 1000;
  const stale: StaleEntry[] = allEntities
    .filter((e) => {
      if (e.entityType === "image") return false;
      const updated = new Date(e.updated).getTime();
      return !isNaN(updated) && updated < staleThreshold;
    })
    .map((e) => ({
      id: e.id,
      entityType: e.entityType,
      title:
        typeof e.metadata["title"] === "string" ? e.metadata["title"] : e.id,
      updated: e.updated,
      daysSinceUpdate: Math.floor(
        (now - new Date(e.updated).getTime()) / (24 * 60 * 60 * 1000),
      ),
    }));

  return { drafts, stale };
}

// ── Helpers ──

function getDrafts(entities: BaseEntity[]): BaseEntity[] {
  return entities.filter((e) => e.metadata["status"] === "draft");
}

async function getAllEntities(
  entityService: ICoreEntityService,
): Promise<BaseEntity[]> {
  const types = entityService.getEntityTypes();
  const all: BaseEntity[] = [];
  for (const type of types) {
    const entities = await entityService.listEntities(type, { limit: 1000 });
    all.push(...entities);
  }
  return all;
}
