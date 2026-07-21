import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
import { KNOWLEDGE_MAP_DATASOURCE_ID } from "../lib/constants";
import { buildKnowledgeMapData } from "../lib/knowledge-map-data";

/**
 * Public site datasource for the knowledge map. Semantic projection stays
 * behind entity-service; the datasource receives only provider-independent
 * coordinates and turns them into zones, points, and counts.
 */
export class KnowledgeMapDataSource implements DataSource {
  readonly id: typeof KNOWLEDGE_MAP_DATASOURCE_ID = KNOWLEDGE_MAP_DATASOURCE_ID;
  readonly name = "Knowledge Map DataSource";
  readonly description =
    "Builds the public knowledge map: the corpus in semantic space with topic territories";

  async fetch<T>(
    _query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const data = await buildKnowledgeMapData({
      entityService: context.entityService,
      semantic: {
        project: (request) =>
          context.entityService.projectSemanticSpace(request),
      },
    });

    return outputSchema.parse(data);
  }
}
