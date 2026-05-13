import { StructuredContentFormatter } from "@brains/content-formatters";
import { topicDetailSchema, type TopicDetailData } from "./schema";

export class TopicDetailFormatter extends StructuredContentFormatter<TopicDetailData> {
  constructor() {
    super(topicDetailSchema, {
      title: "Topic Detail",
      mappings: [
        { key: "id", label: "ID", type: "string" },
        { key: "title", label: "Title", type: "string" },
        { key: "content", label: "Content", type: "string" },
        { key: "created", label: "Created", type: "string" },
        { key: "updated", label: "Updated", type: "string" },
      ],
    });
  }
}
