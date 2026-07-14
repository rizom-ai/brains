import type {
  IEntityService,
  ISemanticNamespace,
  SemanticSpacePoint,
} from "@brains/plugins";
import { AgentAdapter } from "../adapters/agent-adapter";
import type {
  AgentEntity,
  AgentFrontmatter,
  AgentSkill,
} from "../schemas/agent";
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

/** A sighting is a second-order agent: discovered through a peer's
 * directory, carrying introducer provenance, not yet approved. */
function isSighting(frontmatter: AgentFrontmatter): boolean {
  return (
    frontmatter.status === "discovered" &&
    (frontmatter.introducedBy?.length ?? 0) > 0
  );
}

export async function buildProximityMapData(
  context: ProximityMapDataContext,
): Promise<ProximityMapData> {
  const [agents, projection] = await Promise.all([
    context.entityService.listEntities<AgentEntity>({
      entityType: AGENT_ENTITY_TYPE,
    }),
    context.semantic.project({
      types: [AGENT_ENTITY_TYPE],
      origin: BRAIN_CHARACTER_REFERENCE,
      maxNeighborDistance: PROXIMITY_NEIGHBOR_DISTANCE,
    }),
  ]);

  const pointsById = new Map<string, SemanticSpacePoint>(
    projection.points.map((point) => [point.entityId, point]),
  );

  const parsed = agents
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((agent) => ({ agent, ...agentAdapter.parseEntity(agent) }));
  const firstOrder = parsed.filter((entry) => !isSighting(entry.frontmatter));
  const sighted = parsed.filter((entry) => isSighting(entry.frontmatter));

  const nodes: ProximityMapNode[] = [];
  for (const { agent, frontmatter, body } of firstOrder) {
    const point = pointsById.get(agent.id);
    if (!point) continue;

    nodes.push({
      id: agent.id,
      name: frontmatter.name,
      kind: frontmatter.kind,
      status: frontmatter.status,
      tags: flattenSkillTags(body.skills),
      distance: normalizeCosineDistance(point.distanceToOrigin),
      bearing: bearingFromCoordinates(point.coordinates, nodes.length),
    });
  }

  const activeNodes = nodes.filter((node) => node.status !== "archived");
  const activeNodeIds = new Set(activeNodes.map((node) => node.id));

  // Second-order sightings germinate only when semantically near AND
  // honestly routable — at least one introducer must be an active node.
  const sightings: ProximityMapSighting[] = [];
  for (const { agent, frontmatter, body } of sighted) {
    const point = pointsById.get(agent.id);
    if (!point) continue;

    const distance = normalizeCosineDistance(point.distanceToOrigin);
    if (distance > SIGHTING_GERMINATION_DISTANCE) continue;

    const viaIds = (frontmatter.introducedBy ?? []).filter((id) =>
      activeNodeIds.has(id),
    );
    if (viaIds.length === 0) continue;

    sightings.push({
      id: agent.id,
      name: frontmatter.name,
      viaIds,
      tags: flattenSkillTags(body.skills),
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
    pendingCount: Math.max(0, firstOrder.length - nodes.length),
  });
}

function flattenSkillTags(skills: AgentSkill[]): string[] {
  return normalizeTags(skills.flatMap((skill) => skill.tags));
}
