import type { EntityPluginContext } from "@brains/plugins";
import { knowledgeMapDataSchema } from "./knowledge-map-data";
import { buildKnowledgeMapData } from "./knowledge-map-data";
import {
  KnowledgeMapWidget,
  knowledgeMapStyles,
} from "../widgets/knowledge-map";

export const KNOWLEDGE_MAP_WIDGET_ID = "topics-knowledge-map";
const KNOWLEDGE_MAP_WIDGET_RENDERER = "KnowledgeMapWidget";

/**
 * The knowledge map on the console dashboard (docs/plans/knowledge-map.md,
 * phase 3): the corpus as a sky, next to the agent network. Data comes from
 * the phase-1 builder against the live context; the digest carries the
 * honest counts.
 */
export function registerKnowledgeMapDashboardWidget(params: {
  context: EntityPluginContext;
  pluginId: string;
}): void {
  const { context, pluginId } = params;

  context.messaging.subscribe(
    "system:plugins:ready",
    async (): Promise<{ success: boolean }> => {
      await context.messaging.send({
        type: "dashboard:register-widget",
        payload: {
          id: KNOWLEDGE_MAP_WIDGET_ID,
          pluginId,
          title: "Knowledge Map",
          group: "knowledge",
          section: "primary",
          priority: 30,
          rendererName: KNOWLEDGE_MAP_WIDGET_RENDERER,
          component: KnowledgeMapWidget,
          clientStyles: knowledgeMapStyles,
          dataProvider: async () => buildKnowledgeMapData(context),
          digestProvider: (data: unknown) => {
            const parsed = knowledgeMapDataSchema.parse(data);
            return {
              digest: [
                { label: "Entities", value: String(parsed.counts.entities) },
                { label: "Topics", value: String(parsed.counts.topics) },
              ],
            };
          },
        },
      });
      return { success: true };
    },
  );
}
