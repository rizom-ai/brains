import { z, type JobEntityAccess } from "@brains/sdk/entities";
import type { SummaryEntity, SummaryTimeRange } from "../../schemas/summary";
import { summarySchema } from "../../schemas/summary";
import { SUMMARY_ENTITY_TYPE } from "../constants";
import { parseSummaryBody } from "../summary-body";

const MAX_ITEMS = 6;
const WIDGET_ID = "recent";

interface SummaryTimeRangeRow {
  start: string;
  end: string;
}

const summaryTimeRangeRowSchema: z.ZodType<SummaryTimeRangeRow> = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export interface SummaryEntryRow {
  id: string;
  title: string;
  keyPoint?: string | undefined;
  channelName: string;
  channelId: string;
  timeRange: SummaryTimeRangeRow;
  messageCount: number;
}

export const summaryEntryRowSchema: z.ZodType<SummaryEntryRow> = z.object({
  id: z.string(),
  title: z.string(),
  keyPoint: z.string().optional(),
  channelName: z.string(),
  channelId: z.string(),
  timeRange: summaryTimeRangeRowSchema,
  messageCount: z.number().int().min(0),
});

export interface RecentConversationMemoryData {
  all: SummaryEntryRow[];
  byChannel: SummaryEntryRow[];
}

export const recentConversationMemoryDataSchema: z.ZodType<RecentConversationMemoryData> =
  z.object({
    all: z.array(summaryEntryRowSchema),
    byChannel: z.array(summaryEntryRowSchema),
  });

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
  const { entries } = parseSummaryBody(summary.content);
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
  entities: JobEntityAccess,
): Promise<RecentConversationMemoryData> {
  const summaries = await entities.listEntities(
    {
      entityType: SUMMARY_ENTITY_TYPE,
    },
    summarySchema,
  );

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

export const RECENT_MEMORY_WIDGET_ID: typeof WIDGET_ID = WIDGET_ID;
