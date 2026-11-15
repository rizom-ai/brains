import type {
  ServiceCorpusReads,
  ServiceDataSourceDeclaration,
} from "@brains/sdk/internal/service-runtime";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { parseSummaryBody } from "../lib/summary-body";
import { summarySchema } from "../schemas/summary";
import type { SummaryListData } from "../templates/summary-list/schema";
import type { SummaryDetailData } from "../templates/summary-detail/schema";
import { SUMMARY_ENTITY_TYPE } from "../lib/constants";

const summaryDataSourceQuerySchema = z.object({
  id: z.string().optional(),
  conversationId: z.string().optional(),
  limit: z.number().optional(),
});

const entityFetchQuerySchema = z.object({
  entityType: z.literal(SUMMARY_ENTITY_TYPE),
  query: summaryDataSourceQuerySchema.optional(),
});

/**
 * One summary's entries for its detail page, by conversation or id, or a
 * list of summaries with their latest entry, read at the build's scope.
 */
export async function fetchSummaries(
  query: unknown,
  corpus: Pick<ServiceCorpusReads, "getEntity" | "listEntities">,
): Promise<SummaryDetailData | SummaryListData> {
  const params = entityFetchQuerySchema.parse(query);
  const queryId = params.query?.conversationId ?? params.query?.id;

  if (queryId) {
    const found = await corpus.getEntity({
      entityType: SUMMARY_ENTITY_TYPE,
      id: queryId,
    });
    if (!found) throw new Error(`Summary not found: ${queryId}`);
    const entity = summarySchema.parse(found);

    const { entries } = parseSummaryBody(entity.content);
    return {
      conversationId: entity.id,
      channelName: entity.metadata.channelName ?? entity.metadata.channelId,
      entries,
      messageCount: entity.metadata.messageCount,
      entryCount: entries.length,
      updated: entity.updated,
    };
  }

  const entities = (
    await corpus.listEntities({
      entityType: SUMMARY_ENTITY_TYPE,
      options: { limit: params.query?.limit ?? 100 },
    })
  ).map((summary) => summarySchema.parse(summary));

  const summaries = entities.map((summary) => {
    const { entries } = parseSummaryBody(summary.content);
    const latestEntry = entries[entries.length - 1];
    return {
      id: summary.id,
      conversationId: summary.id,
      channelName: summary.metadata.channelName ?? summary.metadata.channelId,
      entryCount: entries.length,
      messageCount: summary.metadata.messageCount,
      latestEntry: latestEntry?.title ?? "No entries",
      updated: summary.updated,
      created: summary.created,
    };
  });

  return { summaries, totalCount: summaries.length };
}

/** Summaries for the site's summary list and detail templates. */
export function summaryDataSource(
  logger: Logger,
): ServiceDataSourceDeclaration {
  logger.debug("SummaryDataSource initialized");
  return {
    id: "entities",
    name: "Summary Entity DataSource",
    description: "Fetches and transforms summary entities for rendering",
    fetch: (query, { corpus }) => fetchSummaries(query, corpus),
  };
}
