import { createTemplate } from "@brains/templates";
import { topicListSchema, type TopicListData } from "./schema";
import { TopicListLayout } from "./layout";
import { TopicListFormatter } from "./formatter";

export const topicListTemplate = createTemplate<TopicListData>({
  name: "topics:topic-list",
  description: "List view of all discovered topics",
  schema: topicListSchema,
  requiredPermission: "public",
  formatter: new TopicListFormatter(),
  layout: {
    component: TopicListLayout,
    interactive: false,
  },
});

export { TopicListLayout } from "./layout";
export { topicListSchema, type TopicListData } from "./schema";
export { TopicListFormatter } from "./formatter";
