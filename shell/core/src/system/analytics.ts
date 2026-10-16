import type {
  BaseEntity,
  ContentVisibility,
  ReadOnlyEntityService,
  EntityRegistry,
} from "@brains/entity-service";
import { AnalyticsRegistry, defineAnalyticsReport } from "@brains/plugins";
import { z } from "@brains/utils/zod";

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

const noParams = z.object({});

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM");
const entityTypes = z
  .array(z.string().min(1))
  .min(1)
  .optional()
  .describe("Only these entity types");

const cadenceParams = z.object({
  entityTypes,
  from: month.optional().describe("First month, YYYY-MM"),
  to: month.optional().describe("Last month, YYYY-MM"),
});

const healthParams = z.object({
  staleDays: z
    .number()
    .int()
    .min(1)
    .max(3650)
    .default(90)
    .describe("Days without an update before content counts as stale"),
  entityTypes,
});

/**
 * The analytics registry with core's generic reports; plugins add theirs.
 */
export function createAnalyticsRegistry(
  entityRegistry: Pick<EntityRegistry, "getEntityTypeConfig">,
): AnalyticsRegistry {
  const registry = new AnalyticsRegistry();

  registry.register(
    defineAnalyticsReport({
      type: "overview",
      description:
        "Entity counts by type, recent activity, and draft and published totals.",
      params: noParams,
      handler: async (_params, { entityService, visibilityScope }) =>
        getOverview(entityService, visibilityScope),
    }),
  );
  registry.register(
    defineAnalyticsReport({
      type: "publishing-cadence",
      description:
        "Pieces per month, by type: counted in the month they were published, or created when never published.",
      params: cadenceParams,
      handler: async (params, { entityService, visibilityScope }) =>
        getPublishingCadence(entityService, visibilityScope, params),
    }),
  );
  registry.register(
    defineAnalyticsReport({
      type: "content-health",
      description: "Drafts and content not updated for a long time.",
      params: healthParams,
      handler: async (params, { entityService, visibilityScope }) =>
        getContentHealth(
          entityService,
          visibilityScope,
          entityRegistry,
          params,
        ),
    }),
  );

  return registry;
}

// ── Built-in report handlers (entity-type agnostic) ──

async function getOverview(
  entityService: ReadOnlyEntityService,
  visibilityScope: ContentVisibility,
): Promise<Record<string, unknown>> {
  const counts = await entityService.getEntityCounts(visibilityScope);
  const entityCounts: Record<string, number> = {};
  let totalEntities = 0;
  for (const { entityType, count } of counts) {
    entityCounts[entityType] = count;
    totalEntities += count;
  }

  const allEntities = await getAllEntities(entityService, visibilityScope);
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

/** When a piece came out: its publish date, or its creation when never published. */
function cameOut(entity: BaseEntity): Date {
  const publishedAt = entity.metadata["publishedAt"];
  return new Date(
    typeof publishedAt === "string" && publishedAt
      ? publishedAt
      : entity.created,
  );
}

function ofTypes(
  entities: BaseEntity[],
  types: readonly string[] | undefined,
): BaseEntity[] {
  return types
    ? entities.filter((e) => types.includes(e.entityType))
    : entities;
}

async function getPublishingCadence(
  entityService: ReadOnlyEntityService,
  visibilityScope: ContentVisibility,
  params: z.output<typeof cadenceParams>,
): Promise<Record<string, unknown>> {
  const allEntities = ofTypes(
    await getAllEntities(entityService, visibilityScope),
    params.entityTypes,
  );
  const monthMap = new Map<string, Record<string, number>>();

  for (const entity of allEntities) {
    const date = cameOut(entity);
    if (isNaN(date.getTime())) continue;

    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    if (
      (params.from && month < params.from) ||
      (params.to && month > params.to)
    )
      continue;
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
  entityService: ReadOnlyEntityService,
  visibilityScope: ContentVisibility,
  entityRegistry: Pick<EntityRegistry, "getEntityTypeConfig">,
  params: z.output<typeof healthParams>,
): Promise<Record<string, unknown>> {
  const allEntities = ofTypes(
    await getAllEntities(entityService, visibilityScope),
    params.entityTypes,
  );

  const drafts: DraftEntry[] = getDrafts(allEntities).map((e) => ({
    id: e.id,
    entityType: e.entityType,
    title: typeof e.metadata["title"] === "string" ? e.metadata["title"] : e.id,
    created: e.created,
  }));

  const now = Date.now();
  const staleThreshold = now - params.staleDays * 24 * 60 * 60 * 1000;
  const stale: StaleEntry[] = allEntities
    .filter((e) => {
      if (entityRegistry.getEntityTypeConfig(e.entityType).binaryStorage)
        return false;
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
  entityService: ReadOnlyEntityService,
  visibilityScope: ContentVisibility,
): Promise<BaseEntity[]> {
  const types = entityService.getEntityTypes();
  const all: BaseEntity[] = [];
  for (const type of types) {
    const entities = await entityService.listEntities({
      entityType: type,
      options: { limit: 1000, filter: { visibilityScope } },
    });
    all.push(...entities);
  }
  return all;
}
