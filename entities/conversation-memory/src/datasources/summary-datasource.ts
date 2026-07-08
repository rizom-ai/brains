import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { SummaryAdapter } from "../adapters/summary-adapter";
import type { SummaryEntity } from "../schemas/summary";
import type { SummaryListData } from "../templates/summary-list/schema";
import type { SummaryDetailData } from "../templates/summary-detail/schema";
import { SUMMARY_DATASOURCE_ID, SUMMARY_ENTITY_TYPE } from "../lib/constants";

interface SummaryDataSourceQuery {
  id?: string | undefined;
  conversationId?: string | undefined;
  limit?: number | undefined;
}

interface EntityFetchQuery {
  entityType: typeof SUMMARY_ENTITY_TYPE;
  query?: SummaryDataSourceQuery | undefined;
}

const summaryDataSourceQuerySchema: z.ZodType<SummaryDataSourceQuery> =
  z.object({
    id: z.string().optional(),
    conversationId: z.string().optional(),
    limit: z.number().optional(),
  });

const entityFetchQuerySchema: z.ZodType<EntityFetchQuery> = z.object({
  entityType: z.literal(SUMMARY_ENTITY_TYPE),
  query: summaryDataSourceQuerySchema.optional(),
});

export class SummaryDataSource implements DataSource {
  private readonly logger: Logger;
  public readonly id: typeof SUMMARY_DATASOURCE_ID = SUMMARY_DATASOURCE_ID;
  public readonly name: string = "Summary Entity DataSource";
  public readonly description: string =
    "Fetches and transforms summary entities for rendering";

  private readonly adapter: SummaryAdapter = new SummaryAdapter();

  constructor(logger: Logger) {
    this.logger = logger;
    this.logger.debug("SummaryDataSource initialized");
  }

  async fetch<T>(
    query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const params: EntityFetchQuery = entityFetchQuerySchema.parse(query);
    const entityService = context.entityService;
    const queryId = params.query?.conversationId ?? params.query?.id;

    if (queryId) {
      const entity = await entityService.getEntity<SummaryEntity>({
        entityType: SUMMARY_ENTITY_TYPE,
        id: queryId,
      });
      if (!entity) throw new Error(`Summary not found: ${queryId}`);

      const { entries } = this.adapter.parseBody(entity.content);
      const detailData: SummaryDetailData = {
        conversationId: entity.metadata.conversationId,
        channelName: entity.metadata.channelName ?? entity.metadata.channelId,
        entries,
        messageCount: entity.metadata.messageCount,
        entryCount: entries.length,
        updated: entity.updated,
      };
      return outputSchema.parse(detailData);
    }

    const entities = await entityService.listEntities<SummaryEntity>({
      entityType: SUMMARY_ENTITY_TYPE,
      options: { limit: params.query?.limit ?? 100 },
    });

    const summaries = entities.map((summary) => {
      const { entries } = this.adapter.parseBody(summary.content);
      const latestEntry = entries[entries.length - 1];
      return {
        id: summary.id,
        conversationId: summary.metadata.conversationId,
        channelName: summary.metadata.channelName ?? summary.metadata.channelId,
        entryCount: entries.length,
        messageCount: summary.metadata.messageCount,
        latestEntry: latestEntry?.title ?? "No entries",
        updated: summary.updated,
        created: summary.created,
      };
    });

    const listData: SummaryListData = {
      summaries,
      totalCount: summaries.length,
    };

    return outputSchema.parse(listData);
  }
}
