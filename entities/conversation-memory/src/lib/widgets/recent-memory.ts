import type { EntityPluginContext } from "@brains/plugins";
import { z } from "@brains/utils";
import {
  summaryTimeRangeSchema,
  type SummaryEntity,
  type SummaryTimeRange,
} from "../../schemas/summary";
import { SUMMARY_ENTITY_TYPE } from "../constants";
import { SummaryAdapter } from "../../adapters/summary-adapter";

const MAX_ITEMS = 6;
const WIDGET_ID = "conversation-memory:recent";
const WIDGET_RENDERER = "RecentConversationMemoryWidget";

const summaryAdapter = new SummaryAdapter();

export const summaryEntryRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  keyPoint: z.string().optional(),
  channelName: z.string(),
  channelId: z.string(),
  timeRange: summaryTimeRangeSchema,
  messageCount: z.number().int().min(0),
});

export type SummaryEntryRow = z.infer<typeof summaryEntryRowSchema>;

export const recentConversationMemoryDataSchema = z.object({
  all: z.array(summaryEntryRowSchema),
  byChannel: z.array(summaryEntryRowSchema),
});

export type RecentConversationMemoryData = z.infer<
  typeof recentConversationMemoryDataSchema
>;

interface ExpandedEntry {
  id: string;
  summaryId: string;
  channelId: string;
  channelName?: string;
  title: string;
  keyPoint?: string;
  timeRange: SummaryTimeRange;
  messageCount: number;
}

function expandSummary(summary: SummaryEntity): ExpandedEntry[] {
  const { entries } = summaryAdapter.parseBody(summary.content);
  return entries.map((entry, index) => ({
    id: `${summary.id}#${index}`,
    summaryId: summary.id,
    channelId: summary.metadata.channelId,
    ...(summary.metadata.channelName !== undefined
      ? { channelName: summary.metadata.channelName }
      : {}),
    title: entry.title,
    ...(entry.keyPoints[0] !== undefined
      ? { keyPoint: entry.keyPoints[0] }
      : {}),
    timeRange: entry.timeRange,
    messageCount: entry.sourceMessageCount,
  }));
}

function toRow(entry: ExpandedEntry): SummaryEntryRow {
  return {
    id: entry.id,
    title: entry.title,
    ...(entry.keyPoint !== undefined ? { keyPoint: entry.keyPoint } : {}),
    channelName: entry.channelName ?? entry.channelId,
    channelId: entry.channelId,
    timeRange: entry.timeRange,
    messageCount: entry.messageCount,
  };
}

export async function buildRecentConversationMemoryData(
  context: EntityPluginContext,
): Promise<RecentConversationMemoryData> {
  const summaries = await context.entityService.listEntities<SummaryEntity>({
    entityType: SUMMARY_ENTITY_TYPE,
  });

  const expanded = summaries.flatMap(expandSummary);
  expanded.sort((a, b) => b.timeRange.end.localeCompare(a.timeRange.end));

  const all = expanded.slice(0, MAX_ITEMS).map(toRow);

  const seenChannels = new Set<string>();
  const byChannel: SummaryEntryRow[] = [];
  for (const entry of expanded) {
    if (seenChannels.has(entry.channelId)) continue;
    seenChannels.add(entry.channelId);
    byChannel.push(toRow(entry));
    if (byChannel.length >= MAX_ITEMS) break;
  }

  return { all, byChannel };
}

export const RECENT_MEMORY_WIDGET_ID = WIDGET_ID;
export const RECENT_MEMORY_WIDGET_RENDERER = WIDGET_RENDERER;
