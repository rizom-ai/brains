import type {
  ServiceCorpusReads,
  ServiceDataSourceDeclaration,
} from "@brains/sdk/internal/service-runtime";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { topicEntitySchema } from "../schemas/topic";
import { TOPIC_ENTITY_TYPE } from "../lib/constants";
import { toTopicDetail, toTopicSummary } from "../lib/topic-presenter";
import type { TopicDetailData } from "../templates/topic-detail/schema";
import type { TopicListData } from "../templates/topic-list/schema";

/** What a template asks the topics source: one topic, or a page of them. */
const topicsQuerySchema = z.looseObject({
  query: z
    .looseObject({
      id: z.string().optional(),
      limit: z.number().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
    })
    .optional(),
});

/**
 * Topics as the site renders them: a page of summaries, most recently
 * updated first, or one topic's detail with its full content.
 */
export async function fetchTopics(
  query: unknown,
  reads: Pick<ServiceCorpusReads, "listEntities" | "getEntity">,
): Promise<TopicListData | TopicDetailData> {
  const params = topicsQuerySchema.parse(query).query ?? {};
  if (params.id) {
    const entity = await reads.getEntity({
      entityType: TOPIC_ENTITY_TYPE,
      id: params.id,
    });
    if (!entity) throw new Error(`Entity not found: ${params.id}`);
    return toTopicDetail(entity);
  }
  const perPage = params.pageSize ?? params.limit ?? 100;
  const entities = await reads.listEntities({
    entityType: TOPIC_ENTITY_TYPE,
    options: {
      limit: perPage,
      offset: ((params.page ?? 1) - 1) * perPage,
      sortFields: [{ field: "updated", direction: "desc" }],
    },
  });
  const topics = entities.map((entity) =>
    toTopicSummary(topicEntitySchema.parse(entity)),
  );
  return { topics, totalCount: topics.length };
}

/** The topics source as the brain registers it: `topics:entities`. */
export function topicsDataSource(logger: Logger): ServiceDataSourceDeclaration {
  logger.debug("TopicsDataSource initialized");
  return {
    id: "entities",
    name: "Topics Entity DataSource",
    description: "Fetches and transforms topic entities for rendering",
    fetch: (query, { corpus }) => fetchTopics(query, corpus),
  };
}
