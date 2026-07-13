import type { SemanticSpaceNeighbor } from "@brains/plugins";
import type {
  ProximityMapCluster,
  ProximityMapNode,
} from "./proximity-map-schema";

const GOLDEN_ANGLE_DEGREES = 180 * (3 - Math.sqrt(5));
const ZERO_COORDINATE_EPSILON = 1e-12;

export function normalizeCosineDistance(distance: number): number {
  return Math.max(0, Math.min(1, distance));
}

export function bearingFromCoordinates(
  coordinates: [number, number],
  fallbackIndex: number,
): number {
  const [x, y] = coordinates;
  if (Math.hypot(x, y) <= ZERO_COORDINATE_EPSILON) {
    return (fallbackIndex * GOLDEN_ANGLE_DEGREES) % 360;
  }

  const degrees = (Math.atan2(y, x) * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

export function buildProximityClusters(
  nodes: ProximityMapNode[],
  neighbors: SemanticSpaceNeighbor[],
): ProximityMapCluster[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, Set<string>>(
    nodes.map((node) => [node.id, new Set<string>()]),
  );

  for (const neighbor of neighbors) {
    if (
      neighbor.source.entityType !== "agent" ||
      neighbor.target.entityType !== "agent" ||
      neighbor.source.entityId === neighbor.target.entityId ||
      !nodesById.has(neighbor.source.entityId) ||
      !nodesById.has(neighbor.target.entityId)
    ) {
      continue;
    }

    adjacency.get(neighbor.source.entityId)?.add(neighbor.target.entityId);
    adjacency.get(neighbor.target.entityId)?.add(neighbor.source.entityId);
  }

  const visited = new Set<string>();
  const components: string[][] = [];
  for (const id of Array.from(nodesById.keys()).sort()) {
    if (visited.has(id)) continue;

    const component: string[] = [];
    const pending = [id];
    visited.add(id);
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current) continue;
      component.push(current);

      for (const connected of Array.from(adjacency.get(current) ?? []).sort()) {
        if (visited.has(connected)) continue;
        visited.add(connected);
        pending.push(connected);
      }
    }

    if (component.length >= 2) components.push(component.sort());
  }

  return components
    .map((memberIds) => ({
      label: deriveClusterLabel(memberIds, nodesById),
      memberIds,
      links: memberIds.flatMap((sourceId) =>
        Array.from(adjacency.get(sourceId) ?? [])
          .filter((targetId) => sourceId.localeCompare(targetId) < 0)
          .sort()
          .map((targetId) => ({ sourceId, targetId })),
      ),
    }))
    .sort((left, right) => {
      const leftTagged = left.memberIds.some(
        (id) => (nodesById.get(id)?.tags.length ?? 0) > 0,
      );
      const rightTagged = right.memberIds.some(
        (id) => (nodesById.get(id)?.tags.length ?? 0) > 0,
      );
      if (leftTagged !== rightTagged) return leftTagged ? -1 : 1;

      const labelDifference = left.label.localeCompare(right.label);
      return labelDifference !== 0
        ? labelDifference
        : (left.memberIds[0] ?? "").localeCompare(right.memberIds[0] ?? "");
    });
}

function deriveClusterLabel(
  memberIds: string[],
  nodesById: Map<string, ProximityMapNode>,
): string {
  const counts = new Map<string, number>();
  for (const id of memberIds) {
    const node = nodesById.get(id);
    for (const tag of new Set(node?.tags ?? [])) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const topTag = Array.from(counts.entries()).sort((left, right) => {
    const countDifference = right[1] - left[1];
    return countDifference !== 0
      ? countDifference
      : left[0].localeCompare(right[0]);
  })[0]?.[0];

  return topTag
    ? `${topTag} · ${memberIds.length}`
    : `unknown · ${memberIds.length}`;
}
