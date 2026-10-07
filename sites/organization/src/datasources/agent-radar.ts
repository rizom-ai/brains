import type { BaseEntity, SemanticSpaceNeighbor } from "@brains/plugins";
import {
  mostCommonTag,
  proximityMaxDistance,
  proximityPoint,
} from "@brains/agent-discovery/proximity-map";
import {
  buildProximityMapData,
  type ProximityMapDataContext,
} from "@brains/agent-discovery/proximity-map-data";
import { z } from "@brains/utils/zod";
import type {
  AgentRadar,
  RadarAgent,
  RadarConstellation,
} from "../schemas/radar";

/** The projection plus the build's scoped agent reads; nothing else. */
export interface AgentRadarSource {
  semantic: ProximityMapDataContext["semantic"];
  entityService: ProximityMapDataContext["entities"] & {
    listEntities(request: { entityType: string }): Promise<BaseEntity[]>;
  };
}

/** The team at the middle of the radar's square; the farthest agent sits inside the edge ring. */
const RADAR_DISC = { x: 50, y: 50, radius: 44 };

/**
 * How far an agent reaches for the agent it joins, in cosine distance.
 * Agent descriptions sit farther apart than the console clusters' fixed
 * cut-off expects, so constellations form around nearest neighbours.
 */
const CONSTELLATION_REACH = 0.35;

const agentMetadataSchema = z.looseObject({ slug: z.string() });

const mean = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

interface Group {
  memberIds: string[];
  links: { from: string; to: string }[];
}

/**
 * Groups of shown agents, each agent joined to the shown agent nearest it
 * within reach (ties to the first id). Joining only the nearest keeps a
 * chain of near pairs from running into one group; agents the page does not
 * show never hold a group together.
 */
function nearestGroups(
  ids: readonly string[],
  neighbours: readonly SemanticSpaceNeighbor[],
): Group[] {
  const shown = new Set(ids);
  const nearest = neighbours
    .filter(
      ({ source, target, distance }) =>
        distance <= CONSTELLATION_REACH &&
        source.entityId !== target.entityId &&
        shown.has(source.entityId) &&
        shown.has(target.entityId),
    )
    .flatMap(({ source, target, distance }) => [
      { from: source.entityId, to: target.entityId, distance },
      { from: target.entityId, to: source.entityId, distance },
    ])
    .reduce((best, { from, to, distance }) => {
      const current = best.get(from);
      const closer =
        !current ||
        distance < current.distance ||
        (distance === current.distance && to.localeCompare(current.to) < 0);
      return closer ? best.set(from, { to, distance }) : best;
    }, new Map<string, { to: string; distance: number }>());
  const links = Array.from(
    new Map(
      Array.from(nearest.entries()).map(([from, { to }]) => {
        const [a, b] = [from, to].sort();
        return [`${a} ${b}`, { from: a ?? from, to: b ?? to }];
      }),
    ).values(),
  ).sort((x, y) => x.from.localeCompare(y.from) || x.to.localeCompare(y.to));
  const joined = links.reduce(
    (graph, { from, to }) =>
      graph
        .set(from, [...(graph.get(from) ?? []), to])
        .set(to, [...(graph.get(to) ?? []), from]),
    new Map<string, string[]>(),
  );
  const seen = new Set<string>();
  const collect = (id: string): string[] => {
    if (seen.has(id)) return [];
    seen.add(id);
    return [id, ...(joined.get(id) ?? []).flatMap(collect)];
  };
  return [...ids].sort().flatMap((id) => {
    if (!joined.has(id) || seen.has(id)) return [];
    const memberIds = collect(id).sort();
    return [
      {
        memberIds,
        links: links.filter(({ from }) => memberIds.includes(from)),
      },
    ];
  });
}

/**
 * A constellation for each group whose members share a tag, at their mean
 * position and named by the tag most of them share: a constellation needs
 * something in common to be called by.
 */
function constellations(
  groups: Group[],
  agents: RadarAgent[],
  tagsById: Map<string, string[]>,
): RadarConstellation[] {
  const placed = new Map(agents.map((entry) => [entry.id, entry]));
  return groups.flatMap(({ memberIds, links }) => {
    const members = memberIds.flatMap((id) => {
      const entry = placed.get(id);
      return entry ? [entry] : [];
    });
    const tags = members.map((entry) => tagsById.get(entry.id) ?? []);
    const name = mostCommonTag(tags);
    const sharing = name
      ? tags.filter((memberTags) => memberTags.includes(name)).length
      : 0;
    const [first] = members;
    if (!first || !name || sharing < 2) return [];
    return [
      {
        id: `constellation:${first.id}`,
        name,
        memberIds,
        links,
        x: mean(members.map((entry) => entry.x)),
        y: mean(members.map((entry) => entry.y)),
      },
    ];
  });
}

/**
 * Build-time radar data: the agents the team works with and the ones
 * awaiting its review, placed around it as the console's proximity map
 * places them, gathered into named constellations. The scoped entity service
 * decides which agents the build may show; archived agents and second-order
 * sightings stay on the console. Without a projection (no embeddings) or any
 * agent to show, the homepage has no map.
 */
export async function loadAgentRadar(
  source: AgentRadarSource,
): Promise<AgentRadar | null> {
  try {
    // Constellations need every pair within reach, so the loader asks the
    // projection for them and keeps them; the console's clusters go unused.
    const neighbours: SemanticSpaceNeighbor[] = [];
    const [map, listed] = await Promise.all([
      buildProximityMapData({
        entities: source.entityService,
        semantic: {
          project: async (request) => {
            const projection = await source.semantic.project({
              ...request,
              maxNeighborDistance: CONSTELLATION_REACH,
            });
            neighbours.push(...projection.neighbors);
            return projection;
          },
        },
      }),
      source.entityService.listEntities({ entityType: "agent" }),
    ]);
    const slugs = new Map(
      listed.flatMap((entity): [string, string][] => {
        const metadata = agentMetadataSchema.safeParse(entity.metadata);
        return metadata.success ? [[entity.id, metadata.data.slug]] : [];
      }),
    );
    const maxDistance = proximityMaxDistance(map);

    const placed: RadarAgent[] = map.nodes.flatMap((node) => {
      const slug = slugs.get(node.id);
      if (node.status === "archived" || !slug) return [];
      const { x, y } = proximityPoint(
        node.distance,
        node.bearing,
        maxDistance,
        RADAR_DISC,
      );
      return [
        {
          id: node.id,
          entityType: "agent",
          content: "",
          metadata: { slug },
          name: node.name,
          kind: node.kind,
          status: node.status,
          x,
          y,
          constellation: null,
          url: null,
          typeLabel: null,
        },
      ];
    });
    if (!placed.length) return null;

    const named = constellations(
      nearestGroups(
        placed.map((entry) => entry.id),
        neighbours,
      ),
      placed,
      new Map(map.nodes.map((node) => [node.id, node.tags])),
    );
    const constellationOf = new Map(
      named.flatMap(({ name, memberIds }) =>
        memberIds.map((id): [string, string] => [id, name]),
      ),
    );
    return {
      agents: placed.map((entry) => ({
        ...entry,
        constellation: constellationOf.get(entry.id) ?? null,
      })),
      constellations: named,
    };
  } catch {
    // No embeddings or no projection: the opening still renders, without a map.
    return null;
  }
}
