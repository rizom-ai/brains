import type { BaseEntity } from "@brains/plugins";
import {
  buildKnowledgeMapData,
  type KnowledgeMapDataContext,
} from "@brains/topics";
import { z } from "@brains/utils/zod";
import {
  atlasEntityTypeSchema,
  type AtlasItem,
  type AtlasZone,
  type HomepageAtlas,
} from "../schemas/homepage-atlas";

/** The projection plus the build's scoped entity reads; nothing else. */
export interface AtlasSource {
  semantic: KnowledgeMapDataContext["semantic"];
  entityService: {
    listEntities(request: { entityType: string }): Promise<BaseEntity[]>;
  };
}

const atlasMetadataSchema = z.looseObject({
  slug: z.string(),
  title: z.string().optional(),
  publishedAt: z.string().optional(),
  year: z.number().int().optional(),
});

function yearOf(publishedAt: string | undefined): number | null {
  if (!publishedAt) return null;
  const year = new Date(publishedAt).getUTCFullYear();
  return Number.isFinite(year) ? year : null;
}

/**
 * The projection spreads the whole corpus; the atlas shows a published
 * subset, so fit that subset back into the unit square, keeping its shape.
 */
function fitToUnit(
  items: AtlasItem[],
  zones: AtlasZone[],
): { items: AtlasItem[]; zones: AtlasZone[] } {
  const xs = [...items, ...zones].map((mark) => mark.x);
  const ys = [...items, ...zones].map((mark) => mark.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 0.2);
  const offsetX = (1 - (Math.max(...xs) - minX) / span) / 2;
  const offsetY = (1 - (Math.max(...ys) - minY) / span) / 2;
  const fit = <T extends { x: number; y: number }>(mark: T): T => ({
    ...mark,
    x: offsetX + (mark.x - minX) / span,
    y: offsetY + (mark.y - minY) / span,
  });
  return { items: items.map(fit), zones: zones.map(fit) };
}

/**
 * Build-time atlas data: published essays, talks and projects at their
 * projected positions, with the topic territories that hold them. The
 * scoped entity service decides what is published, so production drafts
 * and private entities never reach the page. Without a projection (no
 * embeddings) or anything published, the atlas is omitted.
 */
export async function loadHomepageAtlas(
  source: AtlasSource,
): Promise<HomepageAtlas | null> {
  try {
    const [map, listed] = await Promise.all([
      buildKnowledgeMapData(source),
      Promise.all(
        atlasEntityTypeSchema.options.map((entityType) =>
          source.entityService.listEntities({ entityType }),
        ),
      ),
    ]);
    const published = new Map(
      listed
        .flat()
        .map((entity) => [`${entity.entityType}:${entity.id}`, entity]),
    );

    const items: AtlasItem[] = map.points.flatMap((point) => {
      const entityType = atlasEntityTypeSchema.safeParse(point.entityType);
      const metadata = atlasMetadataSchema.safeParse(
        published.get(`${point.entityType}:${point.id}`)?.metadata,
      );
      if (!entityType.success || !metadata.success) return [];
      return [
        {
          id: point.id,
          entityType: entityType.data,
          content: "",
          metadata: { slug: metadata.data.slug },
          title: metadata.data.title ?? point.title,
          year: metadata.data.year ?? yearOf(metadata.data.publishedAt),
          x: point.x,
          y: point.y,
          zoneId: point.zoneId,
        },
      ];
    });
    if (!items.length) return null;

    const zones: AtlasZone[] = map.zones.flatMap((zone) => {
      const members = items.filter((item) => item.zoneId === zone.id).length;
      return members
        ? [{ id: zone.id, name: zone.name, x: zone.x, y: zone.y, members }]
        : [];
    });

    return fitToUnit(items, zones);
  } catch {
    // No embeddings or no projection: the opening and door still render.
    return null;
  }
}
