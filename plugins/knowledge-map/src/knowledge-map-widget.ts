import type { DashboardOperatorView } from "@brains/sdk/services";
import type { KnowledgeMapData } from "./knowledge-map-data";

function knowledgePointId(entityType: string, id: string): string {
  return `${entityType}:${id}`;
}

/**
 * The map's text detail: what a console that cannot draw the field still
 * shows, and what the digest strip summarises.
 */
export function knowledgeMapWidgetView({
  data,
}: {
  data: KnowledgeMapData;
}): DashboardOperatorView {
  return {
    blocks: [
      {
        type: "spatial",
        layout: "cartesian",
        id: "knowledge-map",
        label: "Knowledge map",
        description: `${data.counts.entities} projected entities arranged around ${data.counts.topics} topic zones. Published work, skills, high-signal knowledge, and background sources remain available in the text detail for this map.`,
        points: data.points.map((point) => ({
          id: knowledgePointId(point.entityType, point.id),
          label: point.title,
          category: point.kind === "pearl" ? "high-signal" : point.kind,
          x: point.x,
          y: point.y,
          ...(point.zoneId ? { zoneId: `topic:${point.zoneId}` } : {}),
          tone:
            point.kind === "published"
              ? "good"
              : point.kind === "pearl"
                ? "warn"
                : "neutral",
          details: [point.entityType],
        })),
        zones: data.zones.map((zone) => ({
          id: `topic:${zone.id}`,
          label: zone.name,
          x: zone.x,
          y: zone.y,
          memberIds: data.points
            .filter((point) => zone.memberIds.includes(point.id))
            .map((point) => knowledgePointId(point.entityType, point.id)),
        })),
        relationships: data.zones.flatMap((zone) =>
          data.points
            .filter((point) => point.zoneId === zone.id)
            .map(
              (
                point,
              ): {
                sourceId: string;
                targetId: string;
                tone: "neutral";
              } => ({
                sourceId: `topic:${zone.id}`,
                targetId: knowledgePointId(point.entityType, point.id),
                tone: "neutral",
              }),
            ),
        ),
        legend: [
          { label: "Published", tone: "good" },
          { label: "Skill", tone: "neutral" },
          { label: "High signal", tone: "warn" },
          { label: "Background", tone: "neutral" },
          { label: "Topic zone", tone: "neutral" },
        ],
      },
    ],
  };
}
