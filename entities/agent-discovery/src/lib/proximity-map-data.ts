import type {
  IEntityService,
  ISemanticNamespace,
  SemanticSpacePoint,
} from "@brains/plugins";
import { AgentAdapter } from "../adapters/agent-adapter";
import { SightingAdapter } from "../adapters/sighting-adapter";
import type { AgentEntity } from "../schemas/agent";
import type { SightingEntity } from "../schemas/sighting";
import { AGENT_ENTITY_TYPE, SIGHTING_ENTITY_TYPE } from "./constants";
import {
  bearingFromCoordinates,
  buildProximityClusters,
  normalizeCosineDistance,
} from "./proximity-map";
import {
  proximityMapDataSchema,
  type ProximityMapData,
  type ProximityMapNode,
  type ProximityMapSighting,
} from "./proximity-map-schema";
import { normalizeTags } from "./tag-vocabulary";

const BRAIN_CHARACTER_REFERENCE = {
  entityId: "brain-character",
  entityType: "brain-character",
} as const;
export const PROXIMITY_NEIGHBOR_DISTANCE = 0.25;
/** The rhizome grows toward nutrients: only sightings semantically near the
 * brain germinate onto the map; the far tail stays in the directory. */
export const SIGHTING_GERMINATION_DISTANCE = 0.5;

export interface ProximityMapDataContext {
  entityService: Pick<IEntityService, "listEntities">;
  semantic: ISemanticNamespace;
}

const agentAdapter = new AgentAdapter();
const sightingAdapter = new SightingAdapter();

export async function buildProximityMapData(
  context: ProximityMapDataContext,
): Promise<ProximityMapData> {
  const [agents, sightingEntities, projection] = await Promise.all([
    context.entityService.listEntities<AgentEntity>({
      entityType: AGENT_ENTITY_TYPE,
    }),
    context.entityService.listEntities<SightingEntity>({
      entityType: SIGHTING_ENTITY_TYPE,
    }),
    context.semantic.project({
      types: [AGENT_ENTITY_TYPE, SIGHTING_ENTITY_TYPE],
      origin: BRAIN_CHARACTER_REFERENCE,
      maxNeighborDistance: PROXIMITY_NEIGHBOR_DISTANCE,
    }),
  ]);

  const pointsByTypeAndId = new Map<string, SemanticSpacePoint>(
    projection.points.map((point) => [
      `${point.entityType}:${point.entityId}`,
      point,
    ]),
  );
  const nodes: ProximityMapNode[] = [];
  for (const agent of agents
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))) {
    const point = pointsByTypeAndId.get(`${AGENT_ENTITY_TYPE}:${agent.id}`);
    if (!point) continue;

    const { frontmatter, body } = agentAdapter.parseEntity(agent);
    nodes.push({
      id: agent.id,
      name: frontmatter.name,
      kind: frontmatter.kind,
      status: frontmatter.status,
      tags: normalizeTags(body.skills.flatMap((skill) => skill.tags)),
      distance: normalizeCosineDistance(point.distanceToOrigin),
      bearing: bearingFromCoordinates(point.coordinates, nodes.length),
    });
  }

  const activeNodes = nodes.filter((node) => node.status !== "archived");
  const activeNodeIds = new Set(activeNodes.map((node) => node.id));

  // Second-order sightings germinate only when semantically near AND
  // honestly routable — at least one introducer must be an active node.
  const sightings: ProximityMapSighting[] = [];
  for (const sighting of sightingEntities
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))) {
    const point = pointsByTypeAndId.get(
      `${SIGHTING_ENTITY_TYPE}:${sighting.id}`,
    );
    if (!point) continue;

    const distance = normalizeCosineDistance(point.distanceToOrigin);
    if (distance > SIGHTING_GERMINATION_DISTANCE) continue;

    const { frontmatter } = sightingAdapter.parseSighting(sighting);
    const viaIds = frontmatter.introducedBy.filter((id) =>
      activeNodeIds.has(id),
    );
    if (viaIds.length === 0) continue;

    sightings.push({
      id: sighting.id,
      name: frontmatter.name,
      viaIds,
      tags: normalizeTags(frontmatter.tags),
      distance,
      bearing: bearingFromCoordinates(point.coordinates, sightings.length),
    });
  }

  return proximityMapDataSchema.parse({
    center: {
      kind: projection.origin.kind === "entity" ? "identity" : "centroid",
    },
    nodes,
    clusters: buildProximityClusters(activeNodes, projection.neighbors),
    sightings,
    distanceRange: projection.distanceRange,
    pendingCount: Math.max(0, agents.length - nodes.length),
  });
}
