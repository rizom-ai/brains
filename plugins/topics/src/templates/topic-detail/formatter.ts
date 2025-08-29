import { StructuredContentFormatter } from "@brains/utils";
import { topicDetailSchema, type TopicDetailData } from "./schema";

export class TopicDetailFormatter extends StructuredContentFormatter<TopicDetailData> {
  constructor() {
    super(topicDetailSchema, {
      title: "Topic Detail",
      mappings: [
        { key: "id", label: "ID", type: "string" },
        { key: "title", label: "Title", type: "string" },
        { key: "summary", label: "Summary", type: "string" },
        { key: "content", label: "Content", type: "string" },
        {
          key: "keywords",
          label: "Keywords",
          type: "array",
          itemType: "string",
        },
        {
          key: "sources",
          label: "Sources",
          type: "array",
          itemType: "object",
        },
        { key: "created", label: "Created", type: "string" },
        { key: "updated", label: "Updated", type: "string" },
      ],
    });
  }
}
