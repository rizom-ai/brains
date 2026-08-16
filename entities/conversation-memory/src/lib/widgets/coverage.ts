import {
  SYSTEM_CHANNELS,
  defineDashboardWidget,
  registerBuiltInDashboardWidget,
  type Conversation,
  type EntityPluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { SummaryEntity } from "../../schemas/summary";
import type { SummaryConfig } from "../../schemas/summary-config";
import { SUMMARY_ENTITY_TYPE } from "../constants";
import { SummarySourceReader } from "../summary-source-reader";
import { evaluateSummaryEligibility } from "../summary-space-eligibility";

const MAX_RECENT_SUMMARY_ITEMS = 6;
const COVERAGE_WIDGET_ID = "coverage";

interface SummaryWidgetItem {
  id: string;
  name: string;
  count?: number;
  status?: string;
}

export interface SummaryDashboardData {
  items: SummaryWidgetItem[];
}

const summaryCoverageDataSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      count: z.number().optional(),
      status: z.string().optional(),
    }),
  ),
});

function coverageTone(status: string | undefined): "good" | "warn" | "neutral" {
  if (status === "current" || status === "active") return "good";
  if (status === "stale" || status === "pending") return "warn";
  return "neutral";
}

const summaryCoverageWidget = defineDashboardWidget({
  id: COVERAGE_WIDGET_ID,
  title: "Conversation memory coverage",
  group: "system",
  placement: "secondary",
  priority: 80,
  permission: "admin",
  data: summaryCoverageDataSchema,
  view: ({ data }) => ({
    blocks: [
      {
        type: "list",
        id: "coverage",
        empty: "No conversation memory coverage available.",
        items: data.items.map((item) => ({
          id: item.id,
          title: item.name,
          ...(item.count !== undefined ? { count: item.count } : {}),
          ...(item.status
            ? {
                badges: [
                  { label: item.status, tone: coverageTone(item.status) },
                ],
              }
            : {}),
        })),
      },
    ],
  }),
});

function getSummaryLabel(summary: SummaryEntity): string {
  const channelName = summary.metadata.channelName?.trim();
  if (channelName) return channelName;
  return summary.metadata.channelId;
}

function hasConfiguredSpace(
  conversation: Conversation,
  spaces: string[],
): boolean {
  return evaluateSummaryEligibility({ conversation, spaces }).eligible;
}

function summarizeCoverageStatus(params: {
  eligibleCount: number;
  summarizedCount: number;
}): string {
  const { eligibleCount, summarizedCount } = params;
  if (eligibleCount === 0) return "none";
  return `${summarizedCount}/${eligibleCount} summarized`;
}

export async function buildSummaryCoverageData(params: {
  context: EntityPluginContext;
  config: SummaryConfig;
}): Promise<SummaryDashboardData> {
  const { context, config } = params;

  const summaries = await context.entityService.listEntities<SummaryEntity>({
    entityType: SUMMARY_ENTITY_TYPE,
    options: {
      sortFields: [{ field: "updated", direction: "desc" }],
    },
  });

  if (context.spaces.length === 0) {
    return {
      items: [
        {
          id: "spaces",
          name: "Configured spaces",
          count: 0,
          status: "disabled",
        },
        ...summaries.slice(0, MAX_RECENT_SUMMARY_ITEMS).map((summary) => ({
          id: `summary:${summary.id}`,
          name: getSummaryLabel(summary),
          count: summary.metadata.entryCount,
          status: `${summary.metadata.messageCount} msgs`,
        })),
      ],
    };
  }

  const sourceReader = new SummarySourceReader(context, config);
  const conversations = await context.conversations.list();
  const summariesByConversationId = new Map(
    summaries.map((summary) => [summary.metadata.conversationId, summary]),
  );

  let eligibleCount = 0;
  let summarizedCount = 0;
  let staleCount = 0;
  let unsummarizedCount = 0;
  const recentSummaryItems: SummaryWidgetItem[] = [];

  const candidateConversations = conversations.filter((conversation) =>
    hasConfiguredSpace(conversation, context.spaces),
  );
  const sources = await Promise.all(
    candidateConversations.map((conversation) =>
      sourceReader.readConversation(conversation.id),
    ),
  );

  for (let index = 0; index < candidateConversations.length; index += 1) {
    const conversation = candidateConversations[index];
    const source = sources[index];
    if (!conversation || !source) continue;

    const eligibility = evaluateSummaryEligibility({
      conversation: source.conversation,
      spaces: context.spaces,
    });
    if (!eligibility.eligible) continue;

    eligibleCount += 1;
    const summary = summariesByConversationId.get(conversation.id);
    if (!summary) {
      unsummarizedCount += 1;
      continue;
    }

    summarizedCount += 1;
    const stale = summary.metadata.sourceHash !== source.sourceHash;
    if (stale) staleCount += 1;

    if (recentSummaryItems.length < MAX_RECENT_SUMMARY_ITEMS) {
      recentSummaryItems.push({
        id: `summary:${summary.id}`,
        name: getSummaryLabel(summary),
        count: summary.metadata.entryCount,
        status: stale ? "stale" : "current",
      });
    }
  }

  const items: SummaryWidgetItem[] = [
    {
      id: "spaces",
      name: "Configured spaces",
      count: context.spaces.length,
      status: "active",
    },
    {
      id: "eligible-conversations",
      name: "Eligible conversations",
      count: eligibleCount,
      status: summarizeCoverageStatus({ eligibleCount, summarizedCount }),
    },
    {
      id: "stale-summaries",
      name: "Stale summaries",
      count: staleCount,
      status: staleCount === 0 ? "current" : "stale",
    },
    {
      id: "unsummarized-conversations",
      name: "Unsummarized eligible",
      count: unsummarizedCount,
      status: unsummarizedCount === 0 ? "current" : "pending",
    },
    ...recentSummaryItems,
  ];

  return { items };
}

export function registerSummaryCoverageWidget(params: {
  context: EntityPluginContext;
  config: SummaryConfig;
}): void {
  const { context, config } = params;
  context.messaging.subscribe(
    SYSTEM_CHANNELS.pluginsRegistered,
    async (): Promise<{ success: boolean }> => {
      await registerBuiltInDashboardWidget({
        context,
        definition: summaryCoverageWidget,
        load: ({ signal }) => {
          signal.throwIfAborted();
          return buildSummaryCoverageData({ context, config });
        },
      });
      return { success: true };
    },
  );
}

export const SUMMARY_COVERAGE_WIDGET_ID: typeof COVERAGE_WIDGET_ID =
  COVERAGE_WIDGET_ID;
