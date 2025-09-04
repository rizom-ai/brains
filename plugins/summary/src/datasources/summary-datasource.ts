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
   * Fetch raw summary entities based on query
   */
  async fetch<T>(query: unknown): Promise<T> {
    // Parse and validate query parameters
    const params = entityFetchQuerySchema.parse(query);

    if (params.query?.conversationId) {
      // Fetch single summary by conversation ID
      const entity = await this.entityService.getEntity<SummaryEntity>(
        "summary",
        params.query.conversationId,
      );

      if (!entity) {
        throw new Error(
          `Summary not found for conversation: ${params.query.conversationId}`,
        );
      }

      return entity as T;
    }

    if (params.query?.id) {
      // Fetch single summary by ID
      const entity = await this.entityService.getEntity<SummaryEntity>(
        params.entityType,
        params.query.id,
      );

      if (!entity) {
        throw new Error(`Summary not found: ${params.query.id}`);
      }

      return entity as T;
    }

    // Fetch multiple summaries
    const entities = await this.entityService.listEntities<SummaryEntity>(
      params.entityType,
      {
        limit: params.query?.limit ?? 100,
      },
    );

    return entities as T;
  }

  /**
   * Transform raw data using adapter for template rendering
   */
  async transform<T>(data: unknown, templateId?: string): Promise<T> {
    this.logger.info("Transform called", {
      templateId,
      dataType: Array.isArray(data) ? "array" : typeof data,
      dataLength: Array.isArray(data) ? (data as unknown[]).length : "N/A",
    });

    // Handle detail view - parse and return structured entries
    if (templateId === "detail") {
      // If data is an array (from list query), we can't show detail view
      if (Array.isArray(data)) {
        throw new Error(
          "Cannot render detail view without specific summary ID",
        );
      }

      const entity = data as SummaryEntity;
      const body = this.adapter.parseSummaryContent(entity.content);

      const detailData: SummaryDetailData = {
        conversationId: body.conversationId,
        entries: body.entries, // Return parsed entries
        totalMessages: body.totalMessages,
        lastUpdated: body.lastUpdated,
        entryCount: body.entries.length,
      };

      return detailData as T;
    }

    // Handle list view - extract basic info
    if (templateId === "list") {
      const entities = Array.isArray(data) ? data : [data];
      const summaries = entities as SummaryEntity[];

      this.logger.info("Creating list data", {
        summaryCount: summaries.length,
        firstSummary: summaries[0]?.id,
      });

      const listData: SummaryListData = {
        summaries: summaries.map((summary) => {
          const body = this.adapter.parseSummaryContent(summary.content);
          const latestEntry = body.entries[0]; // Entries are newest-first

          return {
            id: summary.id,
            conversationId: body.conversationId,
            entryCount: body.entries.length,
            totalMessages: body.totalMessages,
            latestEntry: latestEntry?.title ?? "No entries",
            lastUpdated: body.lastUpdated,
            created: summary.created,
          };
        }),
        totalCount: summaries.length,
      };

      return listData as T;
    }

    // Default: return as-is
    return data as T;
  }
}
