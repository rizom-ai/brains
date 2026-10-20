import {
  defineAnalyticsReport,
  type AnalyticsReportContext,
  type AnalyticsReportDefinition,
  type ContentVisibility,
} from "@brains/plugins";
import { generateIdFromText } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import { topicEntitySchema } from "../schemas/topic";
import { TOPIC_ENTITY_TYPE } from "../lib/constants";
import { getTopicTitle } from "../lib/topic-presenter";
import { sourceKey, type SourceRef } from "../lib/topic-extraction-decisions";
import type { TopicSourceCounts } from "../lib/topic-source-counts";

type AnalyticsEntityService = AnalyticsReportContext["entityService"];
type CountedSource = Pick<SourceRef, "key" | "contentHash">;

const noParams: z.ZodObject<Record<string, never>> = z.object({});
const SOURCE_PAGE_SIZE = 100;

export interface TopicDistributionEntry {
  topic: string;
  title: string;
  /** Visible sources whose current votes support this topic. */
  sources: number;
}

export interface TopicDistributionOptions {
  /** Whether topics are extracted from entities of this type. */
  isSourceType: (
    type: string,
    entityService: AnalyticsEntityService,
  ) => boolean;
  autoExtraction: boolean;
  /** How many of these sources support each topic slug, from extraction's votes. */
  countSources: (
    sources: readonly CountedSource[],
  ) => Promise<TopicSourceCounts>;
}

/** What search can return: a public reader gets no drafts. */
function sourceScope(visibilityScope: ContentVisibility): {
  filter: { visibilityScope: ContentVisibility };
  publishedOnly?: true;
} {
  return {
    filter: { visibilityScope },
    ...(visibilityScope === "public" && { publishedOnly: true }),
  };
}

function sourceTypes(
  entityService: AnalyticsEntityService,
  options: TopicDistributionOptions,
): string[] {
  return entityService
    .getEntityTypes()
    .filter((type) => options.isSourceType(type, entityService));
}

/** One type's visible sources by key, paged so only keys and hashes are held. */
async function readSourcePages(
  entityService: AnalyticsEntityService,
  entityType: string,
  visibilityScope: ContentVisibility,
  offset = 0,
): Promise<CountedSource[]> {
  const page = await entityService.listEntities({
    entityType,
    options: {
      ...sourceScope(visibilityScope),
      limit: SOURCE_PAGE_SIZE,
      offset,
      sortFields: [{ field: "id", direction: "asc" }],
    },
  });
  const refs = page.map((source) => ({
    key: sourceKey(source),
    contentHash: source.contentHash,
  }));
  if (page.length < SOURCE_PAGE_SIZE) return refs;
  return [
    ...refs,
    ...(await readSourcePages(
      entityService,
      entityType,
      visibilityScope,
      offset + SOURCE_PAGE_SIZE,
    )),
  ];
}

/**
 * The topic-distribution report.
 * Returns topics with the number of visible sources supporting each, most
 * supported first, and how many visible sources extraction has read. With no
 * visible topics but visible source content, it says so: extraction runs in
 * the background, and an empty list would otherwise read as "nothing written".
 */
export function createTopicDistributionReport(
  options: TopicDistributionOptions,
): AnalyticsReportDefinition<typeof noParams> {
  return defineAnalyticsReport({
    type: "topic-distribution",
    description:
      "The topics the brain's content covers, most supported first: each topic's title and `sources`, the visible source entities whose current extraction votes support it (a source may support several topics). `coverage` counts the visible source entities, those extraction has read (`attributed`) and those not yet read since their last change (`unattributed`).",
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

      if (topics.length > 0) {
        const sources = (
          await Promise.all(
            sourceTypes(entityService, options).map((entityType) =>
              readSourcePages(entityService, entityType, visibilityScope),
            ),
          )
        ).flat();
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

      const counts = await Promise.all(
        sourceTypes(entityService, options).map((entityType) =>
          entityService.countEntities({
            entityType,
            options: sourceScope(visibilityScope),
          }),
        ),
      );
      const sourceEntities = counts.reduce((sum, count) => sum + count, 0);
      if (sourceEntities === 0) return { topics: [] };

      const reason = options.autoExtraction
        ? "Topics have not been extracted yet; extraction runs in the background."
        : "Automatic topic extraction is off.";
      return {
        topics: [],
        unextracted: {
          sourceEntities,
          hint: `${reason} ${sourceEntities} visible ${sourceEntities === 1 ? "entity exists" : "entities exist"}: use system_search to answer from the content itself.`,
        },
      };
    },
  });
}
