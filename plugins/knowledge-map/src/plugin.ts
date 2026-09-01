import {
  defineDashboardWidget,
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { defineDataSource } from "@brains/sdk/entities";
import { KNOWLEDGE_MAP_LOCAL_ID } from "./constants";
import {
  buildKnowledgeMapData,
  knowledgeMapDataSchema,
  type KnowledgeMapDataContext,
} from "./knowledge-map-data";
import { getKnowledgeMapTemplate } from "./knowledge-map-template";
import { knowledgeMapWidgetView } from "./knowledge-map-widget";
import { KnowledgeMapWidget, knowledgeMapStyles } from "./knowledge-map";

export const KNOWLEDGE_MAP_WIDGET_ID = "topics-knowledge-map";

/**
 * Semantic projection stays behind entity-service; the map receives only
 * provider-independent coordinates and one list call per projected type.
 */
function mapContext(entities: {
  listEntities: KnowledgeMapDataContext["entityService"]["listEntities"];
  project: KnowledgeMapDataContext["semantic"]["project"];
}): KnowledgeMapDataContext {
  return {
    entityService: {
      listEntities: (request) => entities.listEntities(request),
    },
    semantic: { project: (request) => entities.project(request) },
  };
}

const knowledgeMapWidget = defineDashboardWidget({
  id: KNOWLEDGE_MAP_WIDGET_ID,
  title: "Knowledge Map",
  group: "knowledge",
  placement: "primary",
  priority: 30,
  permission: "public",
  data: knowledgeMapDataSchema,
  // The console draws the cartographic field itself; the declarative view
  // below stays as the map's text detail and digest.
  render: {
    component: KnowledgeMapWidget,
    clientStyles: knowledgeMapStyles,
  },
  digest: ({ data }) => ({
    items: [
      { label: "Entities", value: String(data.counts.entities) },
      { label: "Topics", value: String(data.counts.topics) },
    ],
  }),
  view: knowledgeMapWidgetView,
});

/**
 * The knowledge map: the whole corpus arranged in semantic space.
 *
 * Lived in `@brains/topics` until 2026-08-19, because topics is the package
 * that feels like it is about the shape of the knowledge base. It is not
 * about topics — `semantic.project({})` takes no type filter, so the map
 * spans every entity type in the brain. Topics contributes zones to it and
 * nothing more.
 *
 * Two consumers: the site section `sites/rizom-ai` puts on its home page,
 * and a dashboard widget.
 */
const knowledgeMapPackage: ServicePackageDefinition<
  z.ZodObject<Record<never, never>>
> = defineServicePlugin({
  id: "knowledge-map",
  config: z.object({}),
  setup: () => ({}),

  dataSources: () => [
    defineDataSource({
      id: KNOWLEDGE_MAP_LOCAL_ID,
      name: "Knowledge Map DataSource",
      description:
        "Builds the public knowledge map: the corpus in semantic space with topic territories",
      fetch: async (_query, entities) =>
        buildKnowledgeMapData(mapContext(entities)),
    }),
  ],

  templates: () => ({ map: getKnowledgeMapTemplate() }),

  dashboardWidgets: (context) => [
    knowledgeMapWidget.bind(context, async ({ corpus, signal }) => {
      signal.throwIfAborted();
      const data = await buildKnowledgeMapData(mapContext(corpus));
      signal.throwIfAborted();
      return data;
    }),
  ],
});

export default knowledgeMapPackage;
