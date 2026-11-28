import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import {
  defineAnalyticsReport,
  type AnalyticsReportContext,
  type AnalyticsReportDefinition,
} from "@brains/sdk/internal/service-runtime";
import { generateIdFromText } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import { topicEntitySchema } from "../schemas/topic";
import { TOPIC_ENTITY_TYPE } from "../lib/constants";
import { getTopicTitle } from "../lib/topic-presenter";
import type { SourceRef } from "../lib/topic-extraction-decisions";
import type { TopicSourceCounts } from "../lib/topic-source-counts";
import { readVisibleSources } from "../lib/topic-visible-sources";

type AnalyticsEntityService = AnalyticsReportContext["entityService"];
type CountedSource = Pick<SourceRef, "key" | "contentHash">;

const noParams: z.ZodObject<Record<string, never>> = z.object({});

export interface TopicDistributionEntry {
  topic: string;
  title: string;
  /** Visible, extractable sources whose current votes support this topic. */
  sources: number;
}

export interface TopicDistributionOptions {
  /** Whether topics are extracted from entities of this type. */
  isSourceType: (
    type: string,
    entityService: AnalyticsEntityService,
  ) => boolean;
  /** Whether extraction reads this source: its visibility and status. */
  isEligibleSource: (entity: BaseEntity) => boolean;
  autoExtraction: boolean;
  /** How many of these sources support each topic slug, from extraction's votes. */
  countSources: (
    sources: readonly CountedSource[],
  ) => Promise<TopicSourceCounts>;
}

function entityCount(count: number): string {
  return `${count} visible ${count === 1 ? "entity exists" : "entities exist"}`;
}

/**
 * The topic-distribution report.
 * Returns topics with the number of visible sources supporting each, most
 * supported first, and how many of the visible sources extraction reads are
 * still pending. With no visible topics but visible source content, it says
 * so: extraction runs in the background, and an empty list would otherwise
 * read as "nothing written". When extraction reads none of that content, it
 * points to search instead of promising topics.
 */
export function createTopicDistributionReport(
  options: TopicDistributionOptions,
): AnalyticsReportDefinition<typeof noParams> {
  return defineAnalyticsReport({
    type: "topic-distribution",
    description:
      "The topics the brain's content covers, most supported first: each topic's title and `sources`, the visible source entities whose current extraction votes support it (a source may support several topics). `coverage` counts the visible source entities topic extraction reads (`sourceEntities`), those it has read in their current version (`attributed`), and those pending extraction (`unattributed`). Entities extraction never reads, such as content outside its visibility or drafts it skips, are left out of `coverage`. With no topics, `unextracted` or `outsideExtraction` carries a hint to answer from `system_search`.",
    params: noParams,
    handler: async (_params, { entityService, visibilityScope }) => {
      if (!entityService.hasEntityType(TOPIC_ENTITY_TYPE)) {
        return { topics: [] };
      }

      const topics = await entityService.listEntities(
        {
          entityType: TOPIC_ENTITY_TYPE,
          options: { filter: { visibilityScope } },
        },
        topicEntitySchema,
      );
      const visible = await readVisibleSources(
        entityService,
        {
          isSourceType: (type) => options.isSourceType(type, entityService),
          isEligibleSource: options.isEligibleSource,
        },
        visibilityScope,
      );
      const sources = visible.flatMap(({ key, contentHash, eligible }) =>
        eligible ? [{ key, contentHash }] : [],
      );

      if (topics.length > 0) {
        const counts = await options.countSources(sources);
        const distribution: TopicDistributionEntry[] = topics
          .map((topic) => {
            const title = getTopicTitle(topic);
            return {
              topic: topic.id,
              title,
              sources: counts.bySlug.get(generateIdFromText(title)) ?? 0,
            };
          })
          .sort(
            (left, right) =>
              right.sources - left.sources ||
              left.title.localeCompare(right.title),
          );
        return {
          topics: distribution,
          coverage: {
            sourceEntities: sources.length,
            attributed: sources.length - counts.unattributed,
            unattributed: counts.unattributed,
          },
        };
      }

      if (visible.length === 0) return { topics: [] };
      if (sources.length === 0) {
        return {
          topics: [],
          outsideExtraction: {
            sourceEntities: visible.length,
            hint: `Topics are not drawn from the content visible here. ${entityCount(visible.length)}: use system_search to answer from the content itself.`,
          },
        };
      }

      const reason = options.autoExtraction
        ? "Topics have not been extracted yet; extraction runs in the background."
        : "Automatic topic extraction is off.";
      return {
        topics: [],
        unextracted: {
          sourceEntities: sources.length,
          hint: `${reason} ${entityCount(sources.length)} that topics are drawn from: use system_search to answer from the content itself.`,
        },
      };
    },
  });
}
