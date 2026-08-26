import {
  defineDashboardWidget,
  defineEntityDashboardWidget,
  z,
  type EntityConversationSurvey,
  type EntityDashboardWidgetDeclaration,
  type JobEntityAccess,
} from "@brains/sdk/entities";
import type { SummaryEntity } from "../../schemas/summary";
import type { SummaryConfig } from "../../schemas/summary-config";
import { SUMMARY_ENTITY_TYPE } from "../constants";
import { SummarySourceReader } from "../summary-source-reader";
import { evaluateSummaryEligibility } from "../summary-space-eligibility";

const MAX_RECENT_SUMMARY_ITEMS = 6;
/**
 * How many summaries a single render will hash-check.
 *
 * Staleness is the only figure here that costs a read per conversation, and
 * a dashboard tile has no business walking the whole corpus to produce it.
 * Above this the count is reported over the newest summaries and labelled.
 */
const MAX_STALENESS_CHECKS = 25;
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

function summarizeCoverageStatus(params: {
  eligibleCount: number;
  summarizedCount: number;
}): string {
  const { eligibleCount, summarizedCount } = params;
  if (eligibleCount === 0) return "none";
  return `${summarizedCount}/${eligibleCount} summarized`;
}

export async function buildSummaryCoverageData(params: {
  entities: JobEntityAccess;
  conversations: EntityConversationSurvey;
  spaces: readonly string[];
  config: SummaryConfig;
}): Promise<SummaryDashboardData> {
  const { entities, conversations: reader, spaces, config } = params;

  const summaries = await entities.listEntities<SummaryEntity>({
    entityType: SUMMARY_ENTITY_TYPE,
    options: {
      sortFields: [{ field: "updated", direction: "desc" }],
    },
  });

  if (spaces.length === 0) {
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

  const sourceReader = new SummarySourceReader(reader, config);
  const conversations = await reader.list();
  const summariesByConversationId = new Map(
    summaries.map((summary) => [summary.metadata.conversationId, summary]),
  );

  // Eligibility and the counts derived from it need only what the survey
  // already returned. Reading each conversation back by id, and reading the
  // messages of ones with no summary to compare against, is what made this
  // widget cost a query per conversation for a producer that is switched off.
  const eligible = conversations.filter(
    (conversation) =>
      evaluateSummaryEligibility({ conversation, spaces }).eligible,
  );
  const summarized = eligible.flatMap((conversation) => {
    const summary = summariesByConversationId.get(conversation.id);
    return summary ? [{ conversation, summary }] : [];
  });

  const eligibleCount = eligible.length;
  const summarizedCount = summarized.length;
  const unsummarizedCount = eligibleCount - summarizedCount;

  // Staleness is the one thing that needs the messages, because it means
  // "does this summary still hash to its source". Bounded: a dashboard tile
  // must not read the whole corpus, and the newest summaries are the ones
  // the widget can surface.
  const scanned = [...summarized]
    .sort((left, right) =>
      right.summary.updated.localeCompare(left.summary.updated),
    )
    .slice(0, MAX_STALENESS_CHECKS);
  const scannedSources = await Promise.all(
    scanned.map(({ conversation }) =>
      sourceReader.readKnownConversation(conversation),
    ),
  );

  let staleCount = 0;
  const recentSummaryItems: SummaryWidgetItem[] = [];
  for (const [index, { summary }] of scanned.entries()) {
    const source = scannedSources[index];
    if (!source) continue;

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
      count: spaces.length,
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
      // A capped scan says so. Reporting a partial count with the same words
      // as a whole one is how "0 stale" comes to mean "0 of the 25 I looked
      // at" without anyone being told.
      status:
        scanned.length < summarizedCount
          ? `${staleCount === 0 ? "current" : "stale"} in ${scanned.length} newest`
          : staleCount === 0
            ? "current"
            : "stale",
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

/**
 * Coverage is a question about every conversation, not one — which is why
 * the widget context carries a survey the job context deliberately does not.
 */
export function summaryCoverageWidgetDeclaration(
  config: SummaryConfig,
): EntityDashboardWidgetDeclaration {
  return defineEntityDashboardWidget(
    summaryCoverageWidget,
    ({ entities, conversations, spaces, signal }) => {
      signal.throwIfAborted();
      return buildSummaryCoverageData({
        entities,
        conversations,
        spaces,
        config,
      });
    },
  );
}

export const SUMMARY_COVERAGE_WIDGET_ID: typeof COVERAGE_WIDGET_ID =
  COVERAGE_WIDGET_ID;
