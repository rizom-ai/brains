import { topicSourceTypesContract } from "@brains/contracts";
import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  serviceRuntime,
  type ServiceCorpusReads,
} from "@brains/sdk/internal/service-runtime";
import { KNOWLEDGE_MAP_LOCAL_ID } from "./constants";
import { KnowledgeMapWidget, knowledgeMapStyles } from "./knowledge-map";
import {
  buildKnowledgeMapData,
  type KnowledgeMapDataContext,
} from "./knowledge-map-data";
import { getKnowledgeMapTemplate } from "./knowledge-map-template";
import { knowledgeMapWidget } from "./knowledge-map-widget";

const knowledgeMapConfigSchema: z.ZodObject<Record<never, never>> = z.object(
  {},
);

/**
 * The map's reads: the corpus at the scope it is drawn for, and the types
 * topics are drawn from, so a territory and its topic measure against the
 * same sources. Without topics the map counts no sources and projects the
 * whole corpus.
 */
function mapContext(
  corpus: ServiceCorpusReads,
  sourceTypes: () => Promise<string[]>,
): KnowledgeMapDataContext {
  return {
    entityService: corpus,
    semantic: { project: (request) => corpus.projectSemanticSpace(request) },
    sourceTypes,
  };
}

/**
 * The knowledge map: the brain's corpus in semantic space, topics as
 * territories. A site section and its data source, read publicly at the
 * build's scope, and a Dashboard widget that draws the cartographic field
 * itself, read at the viewer's.
 */
const knowledgeMapPackage: ServicePackageDefinition<
  typeof knowledgeMapConfigSchema
> = defineServicePlugin(
  { id: "knowledge-map", config: knowledgeMapConfigSchema },
  {
    subscriptions: (context) => {
      const { messaging } = context;
      const runtime = serviceRuntime(context);
      const sourceTypes = async (): Promise<string[]> => {
        const asked = await messaging.request(topicSourceTypesContract, {});
        return asked.status === "answered" ? asked.data.types : [];
      };

      // The public site: public entities only, made explicit rather than
      // left to the entity service's default.
      runtime.dataSource({
        id: KNOWLEDGE_MAP_LOCAL_ID,
        name: "Knowledge Map DataSource",
        description:
          "Builds the public knowledge map: the corpus in semantic space with topic territories",
        fetch: async (_query, { corpus }) =>
          buildKnowledgeMapData(mapContext(corpus, sourceTypes), "public"),
      });
      runtime.template(KNOWLEDGE_MAP_LOCAL_ID, getKnowledgeMapTemplate());
      runtime.dashboardWidget({
        definition: knowledgeMapWidget,
        // The console draws the cartographic field itself; the declarative
        // view stays as the map's text detail and digest.
        render: {
          component: KnowledgeMapWidget,
          clientStyles: knowledgeMapStyles,
        },
        load: async ({ corpus, visibilityScope, signal }) => {
          signal.throwIfAborted();
          const data = await buildKnowledgeMapData(
            mapContext(corpus, sourceTypes),
            visibilityScope,
          );
          signal.throwIfAborted();
          return data;
        },
      });
      return [];
    },
  },
);

export default knowledgeMapPackage;
