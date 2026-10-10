import { createTemplate, type Template } from "@brains/sdk/entities";
import { topicDetailSchema, type TopicDetailData } from "./schema";
import { TopicDetailLayout } from "./layout";

export const topicDetailTemplate: Template = createTemplate<TopicDetailData>({
  name: "topics:topic-detail",
  description: "Detailed view of a single topic",
  schema: topicDetailSchema,
  dataSourceId: "entities",
  requiredPermission: "public",
  layout: {
    component: TopicDetailLayout,
  },
});

export { TopicDetailLayout } from "./layout";
export { topicDetailSchema, type TopicDetailData } from "./schema";
