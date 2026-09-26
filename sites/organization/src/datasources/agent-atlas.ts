import type { BaseEntity } from "@brains/plugins";
import {
  proximityMaxDistance,
  proximityPoint,
  type ProximityMapNode,
} from "@brains/agent-discovery/proximity-map";
import {
  buildProximityMapData,
  type ProximityMapDataContext,
} from "@brains/agent-discovery/proximity-map-data";
import type {
  AtlasCentre,
  AtlasGlyph,
  AtlasItem,
  HomepageAtlasData,
} from "@brains/site-atlas";
import { z } from "@brains/utils/zod";

/** The projection plus the build's scoped agent reads; nothing else. */
export interface AgentAtlasSource {
  semantic: ProximityMapDataContext["semantic"];
  entityService: ProximityMapDataContext["entityService"] & {
    listEntities(request: { entityType: string }): Promise<BaseEntity[]>;
  };
}

/** People are dots, teams diamonds, organizations squares. */
const kinds: Record<
  ProximityMapNode["kind"],
  { glyph: AtlasGlyph; label: string }
> = {
  person: { glyph: "dot", label: "Person" },
  team: { glyph: "diamond", label: "Team" },
  organization: { glyph: "square", label: "Organization" },
};

/** The map is the unit square, with the organization in its middle. */
const UNIT_DISC = { x: 0.5, y: 0.5, radius: 0.5 };

const agentMetadataSchema = z.looseObject({ slug: z.string() });

/**
 * Build-time atlas data: the agents the organization has approved, placed
 * around it as the console's proximity map places them. The scoped entity
 * service decides which agents the build may show, so private agents never
 * reach the page; discovered and archived agents and second-order sightings
 * stay on the console map. Without a projection (no embeddings) or any
 * approved agent, the atlas is omitted.
 */
export async function loadAgentAtlas(
  source: AgentAtlasSource,
  centre: AtlasCentre,
): Promise<HomepageAtlasData | null> {
  try {
    const [map, listed] = await Promise.all([
      buildProximityMapData(source),
      source.entityService.listEntities({ entityType: "agent" }),
    ]);
    const slugs = new Map(
      listed.flatMap((entity): [string, string][] => {
        const metadata = agentMetadataSchema.safeParse(entity.metadata);
        return metadata.success ? [[entity.id, metadata.data.slug]] : [];
      }),
    );
    const maxDistance = proximityMaxDistance(map);

    const items: AtlasItem[] = map.nodes.flatMap((node) => {
      const slug = slugs.get(node.id);
      if (node.status !== "approved" || !slug) return [];
      const { x, y } = proximityPoint(
        node.distance,
        node.bearing,
        maxDistance,
        UNIT_DISC,
      );
      const kind = kinds[node.kind];
      return [
        {
          id: node.id,
          entityType: "agent",
          glyph: kind.glyph,
          kindLabel: kind.label,
          content: "",
          metadata: { slug },
          title: node.name,
          year: null,
          x,
          y,
          zoneId: null,
          url: null,
          typeLabel: null,
        },
      ];
    });

    return items.length ? { zones: [], items, centre } : null;
  } catch {
    // No embeddings or no projection: the opening still renders, without a map.
    return null;
  }
}
