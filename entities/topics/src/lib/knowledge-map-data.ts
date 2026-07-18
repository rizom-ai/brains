import { z } from "@brains/utils/zod";

/**
 * Knowledge map data (docs/plans/knowledge-map.md, phase 1).
 *
 * A centerless 2D projection of the whole corpus. Topics become zones —
 * territories that hold the entities filed into them — and every other
 * projected entity becomes a point with a render kind. Membership is
 * decided in the projected plane (nearest zone within a radius), so a
 * zone always visually contains its members. Points outside every border
 * are unfiled.
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
  /** The zone this point is filed under; null means unfiled. */
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
interface ProjectedPoint {
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
}

export interface KnowledgeMapDataContext {
  semantic: {
    project(request: Record<string, never>): Promise<ProjectionResult>;
  };
  entityService: {
    listEntities(request: { entityType: string }): Promise<ListedEntity[]>;
  };
}

/** First markdown heading, or the id with its dashes opened up. */
function displayTitle(content: string | undefined, id: string): string {
  const heading = content?.match(/^#\s+(.+)$/m);
  if (heading?.[1]) return heading[1].trim();
  return id.replace(/[-_]+/g, " ").trim();
}

export async function buildKnowledgeMapData(
  context: KnowledgeMapDataContext,
): Promise<KnowledgeMapData> {
  const projection = await context.semantic.project({});

  // Titles come from the entities themselves, one list call per type present.
  const types = [
    ...new Set(projection.points.map((point) => point.entityType)),
  ];
  const titleById = new Map<string, string>();
  await Promise.all(
    types.map(async (entityType) => {
      const entities = await context.entityService.listEntities({ entityType });
      for (const entity of entities) {
        titleById.set(
          `${entityType}:${entity.id}`,
          displayTitle(entity.content, entity.id),
        );
      }
    }),
  );

  // Normalize coordinates to the unit box with a uniform scale, so the
  // projection's aspect (near means near) survives.
  const xs = projection.points.map((point) => point.coordinates[0]);
  const ys = projection.points.map((point) => point.coordinates[1]);
  const minX = Math.min(...xs, 0);
  const minY = Math.min(...ys, 0);
  const span = Math.max(
    Math.max(...xs, 0) - minX,
    Math.max(...ys, 0) - minY,
    Number.EPSILON,
  );
  const norm = (point: ProjectedPoint): { x: number; y: number } => ({
    x: (point.coordinates[0] - minX) / span,
    y: (point.coordinates[1] - minY) / span,
  });

  const zones: KnowledgeMapZone[] = projection.points
    .filter((point) => point.entityType === TOPIC_TYPE)
    .map((point) => ({
      id: point.entityId,
      name:
        titleById.get(`${TOPIC_TYPE}:${point.entityId}`) ??
        displayTitle(undefined, point.entityId),
      ...norm(point),
      memberIds: [],
    }));

  const points: KnowledgeMapPoint[] = projection.points
    .filter((point) => point.entityType !== TOPIC_TYPE)
    .map((point) => {
      const { x, y } = norm(point);
      let zoneId: string | null = null;
      let best = ZONE_RADIUS;
      for (const zone of zones) {
        const distance = Math.hypot(zone.x - x, zone.y - y);
        if (distance <= best) {
          best = distance;
          zoneId = zone.id;
        }
      }
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
