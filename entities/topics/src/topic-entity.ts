import {
  defineEntity,
  defineEntityDashboardWidget,
  type BaseEntity,
  type EntityDefinition,
} from "@brains/sdk/entities";
import { firstSentence } from "@brains/utils/string-utils";
import { createTopicAtprotoProjection } from "./atproto-projection";
import { topicsDataSource } from "./datasources/topics-datasource";
import { TOPIC_ENTITY_TYPE } from "./lib/constants";
import { toTopicContentProjection } from "./lib/topic-presenter";
import {
  topicMetadataSchema,
  topicEntitySchema,
  topicFrontmatterSchema,
} from "./schemas/topic";
import { createTopicBody, parseTopicBody } from "./lib/topic-body";
import { topicExtractionTemplate } from "./templates/extraction-template";
import { topicMergeSynthesisTemplate } from "./templates/merge-synthesis-template";
import { topicDetailTemplate } from "./templates/topic-detail";
import { topicListTemplate } from "./templates/topic-list";
import { topicsWidget } from "./widgets/topics";

/**
 * A recurring theme derived from the user's own content.
 *
 * Excluded from projection sourcing and weighted low: a topic is already a
 * derivation, and deriving topics from topics compounds drift rather than
 * adding knowledge.
 */
export const topic: EntityDefinition<
  typeof TOPIC_ENTITY_TYPE,
  typeof topicMetadataSchema
> = defineEntity({
  type: TOPIC_ENTITY_TYPE,
  purpose: "A recurring theme or subject derived from the user's content.",
  metadata: topicMetadataSchema,
  // The title belongs to authored markdown, not query/display metadata. Keep
  // that envelope when the generic entity reader decodes stored source.
  markdown: {
    frontmatter: topicFrontmatterSchema,
    encode: ({ content }) => {
      const body = parseTopicBody(content);
      return { content: body.content, frontmatter: { title: body.title } };
    },
    decode: ({ content, frontmatter }) => ({
      content: createTopicBody({
        title: topicFrontmatterSchema.parse(frontmatter).title,
        content,
      }),
      metadata: {},
    }),
  },
  config: {
    weight: 0.5,
    projectionSource: false,
    projectionSourceRole: "excluded",
  },
  templates: {
    extraction: topicExtractionTemplate,
    "merge-synthesis": topicMergeSynthesisTemplate,
    "topic-list": topicListTemplate,
    "topic-detail": topicDetailTemplate,
  },
  dataSources: [topicsDataSource],
  atproto: createTopicAtprotoProjection(),

  dashboardWidgets: [
    defineEntityDashboardWidget(topicsWidget, async ({ entities }) => {
      const topics = await entities.listEntities(
        {
          entityType: TOPIC_ENTITY_TYPE,
          options: {
            limit: 10,
            sortFields: [{ field: "updated", direction: "desc" }],
          },
        },
        topicEntitySchema,
      );
      return {
        items: topics.map((entry: BaseEntity) => {
          const projected = toTopicContentProjection(entry);
          const description = firstSentence(projected.content);
          return {
            id: entry.id,
            name: projected.title || entry.id,
            ...(description ? { description } : {}),
          };
        }),
      };
    }),
  ],
});
