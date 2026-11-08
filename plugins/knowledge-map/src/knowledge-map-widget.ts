import {
  defineDashboardWidget,
  type DashboardWidgetDefinition,
} from "@brains/sdk/services";
import { computeContentHash } from "@brains/utils/hash";
import { knowledgeMapDataSchema } from "./knowledge-map-data";
import { KNOWLEDGE_MAP_WIDGET_ID } from "./constants";

export { KNOWLEDGE_MAP_WIDGET_ID };

/** The view's identifier limit; a deep id is kept apart by a short hash. */
const MAX_VIEW_ID = 120;
const MAX_VIEW_LABEL = 160;

function knowledgePointId(entityType: string, id: string): string {
  const full = `${entityType}:${id}`;
  return full.length <= MAX_VIEW_ID
    ? full
    : `${entityType}:${computeContentHash(id).slice(0, 24)}`;
}

function viewLabel(label: string): string {
  return label.length <= MAX_VIEW_LABEL
    ? label
    : `${label.slice(0, MAX_VIEW_LABEL - 1)}…`;
}

export const knowledgeMapWidget: DashboardWidgetDefinition<
  typeof KNOWLEDGE_MAP_WIDGET_ID,
  typeof knowledgeMapDataSchema
> = defineDashboardWidget({
  id: KNOWLEDGE_MAP_WIDGET_ID,
  title: "Knowledge Map",
  group: "knowledge",
  placement: "primary",
  priority: 30,
  permission: "public",
  data: knowledgeMapDataSchema,
  digest: ({ data }) => ({
    items: [
      { label: "Entities", value: String(data.counts.entities) },
      { label: "Topics", value: String(data.counts.topics) },
    ],
  }),
  view: ({ data }) => ({
    blocks: [
      {
        type: "spatial",
        layout: "cartesian",
        id: "knowledge-map",
        label: "Knowledge map",
        description: `${data.counts.entities} projected entities arranged around ${data.counts.topics} topic zones. Published work, skills, high-signal knowledge, and background sources remain available in the text detail for this map.`,
        points: data.points.map((point) => ({
          id: knowledgePointId(point.entityType, point.id),
          label: viewLabel(point.title),
          category: point.kind === "pearl" ? "high-signal" : point.kind,
          x: point.x,
          y: point.y,
          ...(point.zoneId
            ? { zoneId: knowledgePointId("topic", point.zoneId) }
            : {}),
          tone:
            point.kind === "published"
              ? "good"
              : point.kind === "pearl"
                ? "warn"
                : "neutral",
          details: [point.entityType],
        })),
        zones: data.zones.map((zone) => ({
          id: knowledgePointId("topic", zone.id),
          label: viewLabel(zone.name),
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
                sourceId: knowledgePointId("topic", zone.id),
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
  }),
});
