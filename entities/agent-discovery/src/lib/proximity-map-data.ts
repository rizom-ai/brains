import type { ISemanticNamespace, SemanticSpacePoint } from "@brains/plugins";
import { AgentAdapter } from "../adapters/agent-adapter";
import type { AgentEntity } from "../schemas/agent";
import { AGENT_ENTITY_TYPE } from "./constants";
import {
  bearingFromCoordinates,
  buildProximityClusters,
  normalizeCosineDistance,
} from "./proximity-map";
import {
  proximityMapDataSchema,
  type ProximityMapData,
  type ProximityMapNode,
} from "./proximity-map-schema";
import { normalizeTags } from "./tag-vocabulary";

const BRAIN_CHARACTER_REFERENCE = {
  entityId: "brain-character",
  entityType: "brain-character",
} as const;
export const PROXIMITY_NEIGHBOR_DISTANCE = 0.25;

export interface ProximityMapDataContext {
  entityService: {
    listEntities(request: {
      entityType: typeof AGENT_ENTITY_TYPE;
    }): Promise<AgentEntity[]>;
  };
  semantic: ISemanticNamespace;
}

const agentAdapter = new AgentAdapter();

export async function buildProximityMapData(
  context: ProximityMapDataContext,
): Promise<ProximityMapData> {
  const [agents, projection] = await Promise.all([
    context.entityService.listEntities({ entityType: AGENT_ENTITY_TYPE }),
    context.semantic.project({
      types: [AGENT_ENTITY_TYPE],
      origin: BRAIN_CHARACTER_REFERENCE,
      maxNeighborDistance: PROXIMITY_NEIGHBOR_DISTANCE,
    }),
  ]);

  const pointsById = new Map<string, SemanticSpacePoint>(
    projection.points
      .filter((point) => point.entityType === AGENT_ENTITY_TYPE)
      .map((point) => [point.entityId, point]),
  );
  const nodes: ProximityMapNode[] = [];
  for (const agent of agents
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))) {
    const point = pointsById.get(agent.id);
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

  return proximityMapDataSchema.parse({
    center: {
      kind: projection.origin.kind === "entity" ? "identity" : "centroid",
    },
    nodes,
    clusters: buildProximityClusters(activeNodes, projection.neighbors),
    distanceRange: projection.distanceRange,
    pendingCount: Math.max(0, agents.length - nodes.length),
  });
}
