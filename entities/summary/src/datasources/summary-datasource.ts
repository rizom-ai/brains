import type { DataSource, BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import { SummaryAdapter } from "../adapters/summary-adapter";
import type { SummaryEntity } from "../schemas/summary";
import type { SummaryListData } from "../templates/summary-list/schema";
import type { SummaryDetailData } from "../templates/summary-detail/schema";
import { SUMMARY_DATASOURCE_ID, SUMMARY_ENTITY_TYPE } from "../lib/constants";

const entityFetchQuerySchema = z.object({
  entityType: z.literal(SUMMARY_ENTITY_TYPE),
  query: z
    .object({
      id: z.string().optional(),
      conversationId: z.string().optional(),
      limit: z.number().optional(),
    })
    .optional(),
});

export class SummaryDataSource implements DataSource {
  public readonly id = SUMMARY_DATASOURCE_ID;
  public readonly name = "Summary Entity DataSource";
  public readonly description =
    "Fetches and transforms summary entities for rendering";

  private readonly adapter = new SummaryAdapter();

  constructor(private readonly logger: Logger) {
    this.logger.debug("SummaryDataSource initialized");
  }

  async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const params = entityFetchQuerySchema.parse(query);
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
