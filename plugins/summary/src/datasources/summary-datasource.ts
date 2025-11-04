import type { DataSource, DataSourceContext } from "@brains/datasource";
import type { IEntityService, Logger } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
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
   * @param context - Optional context (environment, etc.)
   */
  async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    _context?: DataSourceContext,
  ): Promise<T> {
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

      // Parse entries from content
      let entries;
      try {
        const parsed = parseMarkdownWithFrontmatter(
          entity.content,
          z.record(z.string(), z.unknown()),
        );
        entries = this.adapter.parseEntriesFromContent(parsed.content);
      } catch {
        // Fallback: parse content without frontmatter
        entries = this.adapter.parseEntriesFromContent(entity.content);
      }

      const detailData: SummaryDetailData = {
        conversationId: entity.metadata.conversationId,
        channelName: entity.metadata.channelName,
        entries,
        totalMessages: entity.metadata.totalMessages,
        entryCount: entries.length,
        updated: entity.updated,
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
      // Parse entries from content
      let entries;
      try {
        const parsed = parseMarkdownWithFrontmatter(
          summary.content,
          z.record(z.string(), z.unknown()),
        );
        entries = this.adapter.parseEntriesFromContent(parsed.content);
      } catch {
        // Fallback: parse content without frontmatter
        entries = this.adapter.parseEntriesFromContent(summary.content);
      }

      const latestEntry = entries[0]; // Entries are newest-first

      return {
        id: summary.id,
        conversationId: summary.metadata.conversationId,
        channelName: summary.metadata.channelName,
        entryCount: entries.length,
        totalMessages: summary.metadata.totalMessages,
        latestEntry: latestEntry?.title ?? "No entries",
        updated: summary.updated,
        created: summary.created,
      };
    });

    const listData: SummaryListData = {
      summaries,
      totalCount: summaries.length,
    };

    this.logger.debug("Creating list data", {
      summaryCount: summaries.length,
      firstSummary: summaries[0]?.id,
    });

    return outputSchema.parse(listData);
  }
}
