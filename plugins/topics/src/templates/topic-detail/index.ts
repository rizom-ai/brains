import { createTemplate } from "@brains/templates";
import { topicDetailSchema, type TopicDetailData } from "./schema";
import { TopicDetailLayout } from "./layout";
import { TopicDetailFormatter } from "./formatter";

export const topicDetailTemplate = createTemplate<TopicDetailData>({
  name: "topics:topic-detail",
  description: "Detailed view of a single topic",
  schema: topicDetailSchema,
  dataSourceId: "topics:entities",
  requiredPermission: "public",
  formatter: new TopicDetailFormatter(),
  layout: {
    component: TopicDetailLayout,
    interactive: false,
  },
});

export { TopicDetailLayout } from "./layout";
export { topicDetailSchema, type TopicDetailData } from "./schema";
export { TopicDetailFormatter } from "./formatter";
