import { StructuredContentFormatter } from "@brains/utils";
import { topicListSchema, type TopicListData } from "./schema";

export class TopicListFormatter extends StructuredContentFormatter<TopicListData> {
  constructor() {
    super(topicListSchema, {
      title: "Topic List",
      mappings: [
        {
          key: "topics",
          label: "Topics",
          type: "array",
          itemType: "object",
        },
        {
          key: "totalCount",
          label: "Total Count",
          type: "number",
        },
      ],
    });
  }
}
