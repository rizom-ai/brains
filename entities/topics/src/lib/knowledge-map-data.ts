import type { ContentVisibility } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  SOURCES_PER_TOPIC,
  ownTopicSources,
  type NearSource,
} from "./topic-ownership";

/**
 * Knowledge map data.
 *
 * A centerless 2D projection of the corpus. A corpus beyond a few hundred
 * sources is drawn as its topics and the sources nearest each of them, so
 * the map stays bounded however large it grows. Topics become zones —
 * territories that hold the entities filed into them — and every other
 * projected entity becomes a point with a render kind. Membership is
 * decided in the projected plane (nearest zone within a radius), so a
 * zone always visually contains its members. Points outside every border
 * still render as ordinary source/background marks.
 */

const TOPIC_TYPE = "topic";

/** Render kind by entity type; anything unlisted is ground texture. */
const KIND_BY_TYPE: Record<string, KnowledgeMapPoint["kind"]> = {
  post: "published",
  deck: "published",
  skill: "skill",
  doc: "pearl",
  swot: "pearl",
  link: "pearl",
};

/**
 * Membership radius in normalized units: how far from a topic an entity
 * can sit, in the projected plane, and still be filed under it.
 */
const ZONE_RADIUS = 0.16;

/** Up to this many sources the map draws the whole corpus. */
const FULL_MAP_SOURCES = 600;

const knowledgeMapPointSchema: z.ZodObject<{
  id: z.ZodString;
  entityType: z.ZodString;
  title: z.ZodString;
  kind: z.ZodEnum<{
    published: "published";
    skill: "skill";
    pearl: "pearl";
    ground: "ground";
  }>;
  x: z.ZodNumber;
  y: z.ZodNumber;
  zoneId: z.ZodNullable<z.ZodString>;
}> = z.object({
  id: z.string(),
  entityType: z.string(),
  title: z.string(),
  kind: z.enum(["published", "skill", "pearl", "ground"]),
  x: z.number(),
  y: z.number(),
  /** The zone this point is filed under; null means outside a topic territory. */
  zoneId: z.string().nullable(),
});
export type KnowledgeMapPoint = z.infer<typeof knowledgeMapPointSchema>;

const knowledgeMapZoneSchema: z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
  x: z.ZodNumber;
  y: z.ZodNumber;
  memberIds: z.ZodArray<z.ZodString>;
}> = z.object({
  id: z.string(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  memberIds: z.array(z.string()),
});
export type KnowledgeMapZone = z.infer<typeof knowledgeMapZoneSchema>;

/* The explicit annotation keeps --isolatedDeclarations satisfied for the
   exported schema (the sub-schemas stay module-local). */
export const knowledgeMapDataSchema: z.ZodObject<{
  points: z.ZodArray<typeof knowledgeMapPointSchema>;
  zones: z.ZodArray<typeof knowledgeMapZoneSchema>;
  counts: z.ZodObject<{ entities: z.ZodNumber; topics: z.ZodNumber }>;
}> = z.object({
  points: z.array(knowledgeMapPointSchema),
  zones: z.array(knowledgeMapZoneSchema),
  counts: z.object({
    entities: z.number(),
    topics: z.number(),
  }),
});
export type KnowledgeMapData = z.infer<typeof knowledgeMapDataSchema>;

/* Structural slices of the plugin context — only what the builder needs,
   so tests can stub it without the full plugin machinery. */
export interface ProjectedPoint {
  entityId: string;
  entityType: string;
  coordinates: [number, number];
  distanceToOrigin: number;
}

interface ProjectionResult {
  points: ProjectedPoint[];
}

interface ListedEntity {
  id: string;
  entityType: string;
  content: string;
  metadata?: Record<string, unknown>;
}

interface EntityReference {
  entityType: string;
  entityId: string;
}

export interface KnowledgeMapDataContext {
  semantic: {
    project(request: {
      visibilityScope: ContentVisibility;
      entities?: EntityReference[];
    }): Promise<ProjectionResult>;
  };
  /**
   * The entity types topics are drawn from: a large corpus is counted and
   * each topic's nearest sources are measured among these alone.
   */
  sourceTypes(): Promise<string[]>;
  entityService: {
    listEntities(request: {
      entityType: string;
      options: { filter: { visibilityScope: ContentVisibility } };
    }): Promise<ListedEntity[]>;
    countEntities(request: {
      entityType: string;
      options: { filter: { visibilityScope: ContentVisibility } };
    }): Promise<number>;
    nearestToEntity(request: {
      origin: EntityReference;
      types: string[];
      limit: number;
      visibilityScope: ContentVisibility;
    }): Promise<NearSource[]>;
    getEntity(request: {
      entityType: string;
      id: string;
      visibilityScope: ContentVisibility;
    }): Promise<ListedEntity | null>;
  };
}

/**
 * How close two marks may sit in the unit box before relaxation pushes
 * them apart. Chosen against the render size: ~0.04 of a 1000px field is
 * a comfortable two dot-diameters.
 */
const MIN_MARK_DISTANCE = 0.04;

/** Order-preserving spread of a raw projection into the unit box. */
function spreadLayout(
  raw: { x: number; y: number }[],
): { x: number; y: number }[] {
  if (raw.length === 0) return [];

  // 1. radial rank expansion around the centroid: each point keeps its
  // angle but takes an evenly spaced radius by rank. Monotone along every
  // ray, so radial ordering and angular neighborhoods survive — and a
  // 100x outlier can no longer crush the knot into a corner.
  const cx = raw.reduce((sum, p) => sum + p.x, 0) / raw.length;
  const cy = raw.reduce((sum, p) => sum + p.y, 0) / raw.length;
  const byRadius = raw
    .map((p, index) => ({ index, radius: Math.hypot(p.x - cx, p.y - cy) }))
    .sort((a, b) => a.radius - b.radius || a.index - b.index);
  const rankRadius = new Array<number>(raw.length);
  byRadius.forEach((entry, rank) => {
    rankRadius[entry.index] = (rank + 1) / raw.length;
  });
  const expanded = raw.map((p, index) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const radius = Math.hypot(dx, dy);
    const scaled = rankRadius[index] ?? 0;
    if (radius === 0) return { x: 0, y: 0 };
    return { x: (dx / radius) * scaled, y: (dy / radius) * scaled };
  });

  // 2. fit to the unit box with a uniform scale, centering the short axis
  const minX = Math.min(...expanded.map((p) => p.x));
  const minY = Math.min(...expanded.map((p) => p.y));
  const spanX = Math.max(...expanded.map((p) => p.x)) - minX;
  const spanY = Math.max(...expanded.map((p) => p.y)) - minY;
  const span = Math.max(spanX, spanY, Number.EPSILON);
  const offsetX = (1 - spanX / span) / 2;
  const offsetY = (1 - spanY / span) / 2;
  const fitted = expanded.map((p) => ({
    x: offsetX + (p.x - minX) / span,
    y: offsetY + (p.y - minY) / span,
  }));

  // 3. deterministic relaxation: push apart anything closer than the
  // minimum mark distance, clamped to the box
  for (let iteration = 0; iteration < 60; iteration++) {
    let moved = false;
    for (let i = 0; i < fitted.length; i++) {
      for (let j = i + 1; j < fitted.length; j++) {
        const a = fitted[i];
        const b = fitted[j];
        if (!a || !b) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= MIN_MARK_DISTANCE) continue;
        if (distance === 0) {
          // identical coordinates: separate along a stable index-derived angle
          const angle = ((i * 7 + j * 13) % 360) * (Math.PI / 180);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const push =
          (MIN_MARK_DISTANCE - Math.min(distance, MIN_MARK_DISTANCE)) / 2 ||
          MIN_MARK_DISTANCE / 2;
        const ux = dx / distance;
        const uy = dy / distance;
        a.x = Math.min(1, Math.max(0, a.x - ux * push));
        a.y = Math.min(1, Math.max(0, a.y - uy * push));
        b.x = Math.min(1, Math.max(0, b.x + ux * push));
        b.y = Math.min(1, Math.max(0, b.y + uy * push));
        moved = true;
      }
    }
    if (!moved) break;
  }

  return fitted;
}

/**
 * First markdown heading, else the name the entity's page carries (a
 * section's siglum), else the id with its dashes opened up.
 */
function displayTitle(
  content: string | undefined,
  id: string,
  metadata?: Record<string, unknown>,
): string {
  const heading = content?.match(/^#\s+(.+)$/m);
  if (heading?.[1]) return heading[1].trim();
  for (const key of ["pageTitle", "title"]) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return id.replace(/[-_]+/g, " ").trim();
}

/** Projected points and their titles, before layout. */
interface ProjectedCorpus {
  projection: ProjectionResult;
  titleById: Map<string, string>;
  /**
   * The topic each source sits closest to, keyed by type and id. Without it,
   * a source joins the topic it lands beside on the plane.
   */
  topicBySource?: Map<string, string>;
}

/** Every embedded entity, titled from one list call per type present. */
async function projectWholeCorpus(
  context: KnowledgeMapDataContext,
  visibilityScope: ContentVisibility,
): Promise<ProjectedCorpus> {
  const projection = await context.semantic.project({ visibilityScope });
  const types = [
    ...new Set(projection.points.map((point) => point.entityType)),
  ];
  const titleById = new Map<string, string>();
  await Promise.all(
    types.map(async (entityType) => {
      const entities = await context.entityService.listEntities({
        entityType,
        options: { filter: { visibilityScope } },
      });
      for (const entity of entities) {
        titleById.set(
          `${entityType}:${entity.id}`,
          displayTitle(entity.content, entity.id, entity.metadata),
        );
      }
    }),
  );
  return { projection, titleById };
}

/**
 * The topics, each topic's nearest sources by stored embedding (a store
 * query each, no API call), and whatever the caller must always show.
 */
async function projectAroundTopics(
  context: KnowledgeMapDataContext,
  visibilityScope: ContentVisibility,
  sourceTypes: string[],
  include: EntityReference[],
): Promise<ProjectedCorpus> {
  const topics = await context.entityService.listEntities({
    entityType: TOPIC_TYPE,
    options: { filter: { visibilityScope } },
  });
  const nearest = await Promise.all(
    topics.map((topic) =>
      context.entityService.nearestToEntity({
        origin: { entityType: TOPIC_TYPE, entityId: topic.id },
        types: sourceTypes,
        limit: SOURCES_PER_TOPIC,
        visibilityScope,
      }),
    ),
  );
  const topicBySource = ownTopicSources(
    topics.map((topic, index) => ({
      topicId: topic.id,
      sources: nearest[index] ?? [],
    })),
  );
  const references = [
    ...topics.map((topic) => ({ entityType: TOPIC_TYPE, entityId: topic.id })),
    ...nearest
      .flat()
      .map(({ entityType, entityId }) => ({ entityType, entityId })),
    ...include,
  ].filter(
    (reference, index, all) =>
      all.findIndex(
        (other) =>
          other.entityType === reference.entityType &&
          other.entityId === reference.entityId,
      ) === index,
  );
  const projection = await context.semantic.project({
    visibilityScope,
    entities: references.map(({ entityType, entityId }) => ({
      entityType,
      entityId,
    })),
  });
  const titleById = new Map<string, string>(
    topics.map((topic) => [
      `${TOPIC_TYPE}:${topic.id}`,
      displayTitle(topic.content, topic.id),
    ]),
  );
  await Promise.all(
    projection.points
      .filter((point) => point.entityType !== TOPIC_TYPE)
      .map(async (point) => {
        const entity = await context.entityService.getEntity({
          entityType: point.entityType,
          id: point.entityId,
          visibilityScope,
        });
        if (entity) {
          titleById.set(
            `${point.entityType}:${point.entityId}`,
            displayTitle(entity.content, entity.id, entity.metadata),
          );
        }
      }),
  );
  return {
    projection,
    titleById,
    topicBySource,
  };
}

/** The topic a point lands beside on the plane, within the zone radius. */
function nearestZone(
  zones: KnowledgeMapZone[],
  x: number,
  y: number,
): string | null {
  let zoneId: string | null = null;
  let best = ZONE_RADIUS;
  for (const zone of zones) {
    const distance = Math.hypot(zone.x - x, zone.y - y);
    if (distance <= best) {
      best = distance;
      zoneId = zone.id;
    }
  }
  return zoneId;
}

export async function buildKnowledgeMapData(
  context: KnowledgeMapDataContext,
  visibilityScope: ContentVisibility,
  options: {
    /** Entities the map must show, whatever the corpus size. */
    include?: EntityReference[];
  } = {},
): Promise<KnowledgeMapData> {
  const sourceTypes = await context.sourceTypes();
  const sources = (
    await Promise.all(
      sourceTypes.map((entityType) =>
        context.entityService.countEntities({
          entityType,
          options: { filter: { visibilityScope } },
        }),
      ),
    )
  ).reduce((sum, count) => sum + count, 0);
  const { projection, titleById, topicBySource } =
    sources <= FULL_MAP_SOURCES
      ? await projectWholeCorpus(context, visibilityScope)
      : await projectAroundTopics(
          context,
          visibilityScope,
          sourceTypes,
          options.include ?? [],
        );

  // Layout: PCA output is outlier-heavy — a dense knot plus a few far
  // points, which raw min/max normalization would crush into a corner.
  // Spread it in three order-preserving steps: (1) radial square-root
  // expansion around the centroid (expands the knot, reins in outliers,
  // keeps neighborhoods along every ray), (2) fit to the unit box with a
  // uniform scale, (3) a deterministic relaxation that separates
  // near-identical points so nothing renders on top of anything else.
  const spread = spreadLayout(
    projection.points.map((point) => ({
      x: point.coordinates[0],
      y: point.coordinates[1],
    })),
  );
  const norm = (index: number): { x: number; y: number } =>
    spread[index] ?? { x: 0.5, y: 0.5 };

  const indexed = projection.points.map((point, index) => ({ point, index }));

  const zones: KnowledgeMapZone[] = indexed
    .filter(({ point }) => point.entityType === TOPIC_TYPE)
    .map(({ point, index }) => ({
      id: point.entityId,
      name:
        titleById.get(`${TOPIC_TYPE}:${point.entityId}`) ??
        displayTitle(undefined, point.entityId),
      ...norm(index),
      memberIds: [],
    }));

  const points: KnowledgeMapPoint[] = indexed
    .filter(({ point }) => point.entityType !== TOPIC_TYPE)
    .map(({ point, index }) => {
      const { x, y } = norm(index);
      const zoneId = topicBySource
        ? (topicBySource.get(`${point.entityType}:${point.entityId}`) ?? null)
        : nearestZone(zones, x, y);
      return {
        id: point.entityId,
        entityType: point.entityType,
        title:
          titleById.get(`${point.entityType}:${point.entityId}`) ??
          displayTitle(undefined, point.entityId),
        kind: KIND_BY_TYPE[point.entityType] ?? "ground",
        x,
        y,
        zoneId,
      };
    });

  for (const point of points) {
    if (!point.zoneId) continue;
    zones.find((zone) => zone.id === point.zoneId)?.memberIds.push(point.id);
  }

  return {
    points,
    zones,
    counts: {
      entities: projection.points.length,
      topics: zones.length,
    },
  };
}
