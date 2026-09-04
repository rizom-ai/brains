import {
  defineEntityDataSource,
  type BaseEntity,
  type EntityDataSourceDefinition,
} from "@brains/sdk/entities";
import { truncateText } from "@brains/utils/string-utils";
import { TOPIC_ENTITY_TYPE } from "../lib/constants";
import { toTopicDetail } from "../lib/topic-presenter";
import type { TopicDetailData } from "../templates/topic-detail/schema";
import type { TopicListData } from "../templates/topic-list/schema";
import { topicEntitySchema } from "../schemas/topic";

const SUMMARY_LENGTH = 200;

/**
 * Topics as a list, and one topic on its own page.
 *
 * The transform keeps a topic whole and the list truncates: a summary is a
 * property of how a list renders, not of what a topic is, and a detail page
 * needs the content a summary would have cut.
 */
export const topicsDataSource: EntityDataSourceDefinition<
  BaseEntity,
  TopicDetailData,
  TopicListData
> = defineEntityDataSource({
  id: "entities",
  name: "Topics Entity DataSource",
  description: "Fetches and transforms topic entities for rendering",
  entityType: TOPIC_ENTITY_TYPE,
  entitySchema: topicEntitySchema,
  defaultSort: [{ field: "updated", direction: "desc" }],
  defaultLimit: 100,
  transform: (entity: BaseEntity): TopicDetailData => toTopicDetail(entity),
  list: (items: TopicDetailData[]): TopicListData => ({
    topics: items.map(({ id, title, content, created, updated }) => ({
      id,
      title,
      summary: truncateText(content, SUMMARY_LENGTH),
      created,
      updated,
    })),
    totalCount: items.length,
  }),
  detail: async ({ item }): Promise<TopicDetailData> => item,
});
