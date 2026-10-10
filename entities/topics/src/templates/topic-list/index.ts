import { createTemplate, type Template } from "@brains/sdk/entities";
import { topicListSchema, type TopicListData } from "./schema";
import { TopicListLayout } from "./layout";

export const topicListTemplate: Template = createTemplate<TopicListData>({
  name: "topics:topic-list",
  description: "List view of all discovered topics",
  schema: topicListSchema,
  dataSourceId: "entities",
  requiredPermission: "public",
  layout: {
    component: TopicListLayout,
  },
});

export { TopicListLayout } from "./layout";
export { topicListSchema, type TopicListData } from "./schema";
