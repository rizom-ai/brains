import {
  defineEntityDataSource,
  type AnyEntityDataSourceDefinition,
} from "@brains/sdk/entities";
import { parseSummaryBody } from "../lib/summary-body";
import type { SummaryEntity, SummaryEntry } from "../schemas/summary";
import { summarySchema } from "../schemas/summary";
import type { SummaryDetailData } from "../templates/summary-detail/schema";
import { SUMMARY_DATASOURCE_ID, SUMMARY_ENTITY_TYPE } from "../lib/constants";

interface TransformedSummary {
  id: string;
  conversationId: string;
  channelName: string;
  entries: SummaryEntry[];
  entryCount: number;
  messageCount: number;
  latestEntry: string;
  updated: string;
  created: string;
}

/**
 * Summaries for rendering: the list a reader scans, and the detail they open.
 *
 * Both shapes need the entries parsed out of the body, so the transform does
 * it once per entity rather than each view doing it again.
 */
export const summaryDataSource: AnyEntityDataSourceDefinition =
  defineEntityDataSource({
    id: SUMMARY_DATASOURCE_ID,
    name: "Summary Entity DataSource",
    description: "Fetches and transforms summary entities for rendering",
    entityType: SUMMARY_ENTITY_TYPE,
    entitySchema: summarySchema,
    defaultSort: [{ field: "updated", direction: "desc" }],
    defaultLimit: 100,
    transform: (entity: SummaryEntity): TransformedSummary => {
      const { entries } = parseSummaryBody(entity.content);
      return {
        id: entity.id,
        conversationId: entity.metadata.conversationId,
        channelName: entity.metadata.channelName ?? entity.metadata.channelId,
        entries,
        entryCount: entries.length,
        messageCount: entity.metadata.messageCount,
        latestEntry: entries[entries.length - 1]?.title ?? "No entries",
        updated: entity.updated,
        created: entity.created,
      };
    },
    // Return type inferred: the runtime needs a plain JSON object, and
    // `SummaryListData` is an interface without an index signature.
    // `summaryListSchema` is what checks the shape at render time.
    list: (items: TransformedSummary[]) => ({
      summaries: items.map(({ entries: _entries, ...rest }) => rest),
      totalCount: items.length,
    }),
    detail: ({ item }): SummaryDetailData => ({
      conversationId: item.conversationId,
      channelName: item.channelName,
      entries: item.entries,
      messageCount: item.messageCount,
      entryCount: item.entryCount,
      updated: item.updated,
    }),
  });
