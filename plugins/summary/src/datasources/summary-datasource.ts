import type { DataSource } from "@brains/datasource";
import type { IEntityService, Logger } from "@brains/plugins";
import { z } from "@brains/utils";
import { SummaryAdapter } from "../adapters/summary-adapter";
import type { SummaryEntity } from "../schemas/summary";
import type { SummaryListData } from "../templates/summary-list/schema";
import type { SummaryDetailData } from "../templates/summary-detail/schema";

// Schema for fetch query parameters
const entityFetchQuerySchema = z.object({
  entityType: z.literal("summary"),
  query: z
    .object({
      id: z.string().optional(),
      conversationId: z.string().optional(),
      limit: z.number().optional(),
    })
    .optional(),
});

/**
 * DataSource for fetching and transforming summary entities
 * Uses the SummaryAdapter to parse markdown content into structured data
 */
export class SummaryDataSource implements DataSource {
  public readonly id = "summary:entities";
  public readonly name = "Summary Entity DataSource";
  public readonly description =
    "Fetches and transforms summary entities for rendering";

  private adapter: SummaryAdapter;

  constructor(
    private entityService: IEntityService,
    private readonly logger: Logger,
  ) {
    this.adapter = new SummaryAdapter();
    this.logger.debug("SummaryDataSource initialized");
  }

  /**
   * Fetch and transform summary entities to template-ready format
   * Returns SummaryDetailData for single summary or SummaryListData for multiple
   */
  async fetch<T>(query: unknown, outputSchema: z.ZodSchema<T>): Promise<T> {
    // Parse and validate query parameters
    const params = entityFetchQuerySchema.parse(query);

    const queryId = params.query?.conversationId ?? params.query?.id;
    if (queryId) {
      // Fetch single summary (detail view)
      const entity = await this.entityService.getEntity<SummaryEntity>(
        params.query?.conversationId ? "summary" : params.entityType,
        queryId,
      );

      if (!entity) {
        throw new Error(`Summary not found: ${queryId}`);
      }

      // Transform to SummaryDetailData
      const body = this.adapter.parseSummaryContent(entity.content);

      const detailData: SummaryDetailData = {
        conversationId: body.conversationId,
        channelName: entity.metadata.channelName,
        entries: body.entries,
        totalMessages: body.totalMessages,
        lastUpdated: body.lastUpdated,
        entryCount: body.entries.length,
      };

      return outputSchema.parse(detailData);
    }

    // Fetch multiple summaries (list view)
    const entities = await this.entityService.listEntities<SummaryEntity>(
      params.entityType,
      {
        limit: params.query?.limit ?? 100,
      },
    );

    // Transform to SummaryListData with channel names
    const summaries = entities.map((summary) => {
      const body = this.adapter.parseSummaryContent(summary.content);
      const latestEntry = body.entries[0]; // Entries are newest-first

      // Get channel name from summary metadata
      const channelName = summary.metadata.channelName;

      return {
        id: summary.id,
        conversationId: body.conversationId,
        channelName,
        entryCount: body.entries.length,
        totalMessages: body.totalMessages,
        latestEntry: latestEntry?.title ?? "No entries",
        lastUpdated: body.lastUpdated,
        created: summary.created,
      };
    });

    const listData: SummaryListData = {
      summaries,
      totalCount: summaries.length,
    };

    this.logger.info("Creating list data", {
      summaryCount: summaries.length,
      firstSummary: summaries[0]?.id,
    });

    return outputSchema.parse(listData);
  }
}
