import { SYSTEM_CHANNELS, DASHBOARD_CHANNELS } from "@brains/plugins";
import {
  buildKnowledgeMapData,
  knowledgeMapDataSchema,
  type KnowledgeMapData,
  type KnowledgeMapDataContext,
} from "./knowledge-map-data";
import {
  KnowledgeMapWidget,
  knowledgeMapStyles,
} from "../widgets/knowledge-map";

export const KNOWLEDGE_MAP_WIDGET_ID = "topics-knowledge-map";
const KNOWLEDGE_MAP_WIDGET_RENDERER = "KnowledgeMapWidget";

export interface KnowledgeMapWidgetRegistration {
  id: string;
  pluginId: string;
  title: string;
  group: string;
  section: string;
  priority: number;
  rendererName: string;
  component: typeof KnowledgeMapWidget;
  clientStyles: string;
  dataProvider: () => Promise<KnowledgeMapData>;
  digestProvider: (data: unknown) => {
    digest: { label: string; value: string }[];
  };
}

/**
 * The narrow context this registration actually uses: the builder's data
 * context plus the minimal messaging surface. The full plugin context
 * satisfies it structurally — no adapters, no casts.
 */
export interface KnowledgeMapWidgetContext extends KnowledgeMapDataContext {
  messaging: {
    subscribe(
      channel: string,
      handler: () => Promise<{ success: boolean }>,
    ): () => void;
    send(request: {
      type: string;
      payload: KnowledgeMapWidgetRegistration;
    }): Promise<unknown>;
  };
}

/**
 * The knowledge map on the console dashboard: the corpus as a sky, next to
 * the agent network. Data comes from the live semantic projection; the digest
 * carries the honest counts.
 */
export function knowledgeMapWidgetRegistration(
  context: KnowledgeMapDataContext,
  pluginId: string,
): KnowledgeMapWidgetRegistration {
  return {
    id: KNOWLEDGE_MAP_WIDGET_ID,
    pluginId,
    title: "Knowledge Map",
    group: "knowledge",
    section: "primary",
    priority: 30,
    rendererName: KNOWLEDGE_MAP_WIDGET_RENDERER,
    component: KnowledgeMapWidget,
    clientStyles: knowledgeMapStyles,
    dataProvider: async (): Promise<KnowledgeMapData> =>
      buildKnowledgeMapData(context),
    digestProvider: (
      data: unknown,
    ): { digest: { label: string; value: string }[] } => {
      const parsed = knowledgeMapDataSchema.parse(data);
      return {
        digest: [
          { label: "Entities", value: String(parsed.counts.entities) },
          { label: "Topics", value: String(parsed.counts.topics) },
        ],
      };
    },
  };
}

export function registerKnowledgeMapDashboardWidget(params: {
  context: KnowledgeMapWidgetContext;
  pluginId: string;
}): void {
  const { context, pluginId } = params;

  context.messaging.subscribe(
    SYSTEM_CHANNELS.pluginsRegistered,
    async (): Promise<{ success: boolean }> => {
      await context.messaging.send({
        type: DASHBOARD_CHANNELS.registerWidget,
        payload: knowledgeMapWidgetRegistration(context, pluginId),
      });
      return { success: true };
    },
  );
}
