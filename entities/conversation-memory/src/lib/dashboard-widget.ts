import type { Conversation, EntityPluginContext } from "@brains/plugins";
import type { SummaryConfig, SummaryEntity } from "../schemas/summary";
import { SUMMARY_ENTITY_TYPE, SUMMARY_PLUGIN_ID } from "./constants";
import { SummarySourceReader } from "./summary-source-reader";
import { evaluateSummaryEligibility } from "./summary-space-eligibility";

const MAX_RECENT_SUMMARY_ITEMS = 6;

interface SummaryWidgetItem {
  id: string;
  name: string;
  count?: number;
  status?: string;
}

export interface SummaryDashboardData {
  items: SummaryWidgetItem[];
}

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

export async function buildSummaryDashboardData(params: {
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
      messages: source.messages,
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

export function registerSummaryDashboardWidget(params: {
  context: EntityPluginContext;
  pluginId: string;
  config: SummaryConfig;
}): void {
  const { context, pluginId, config } = params;

  context.messaging.subscribe(
    "system:plugins:ready",
    async (): Promise<{ success: boolean }> => {
      await context.messaging.send({
        type: "dashboard:register-widget",
        payload: {
          id: SUMMARY_PLUGIN_ID,
          pluginId,
          title: "Conversation Memory",
          section: "secondary",
          priority: 30,
          rendererName: "ListWidget",
          dataProvider: () => buildSummaryDashboardData({ context, config }),
        },
      });
      return { success: true };
    },
  );
}
