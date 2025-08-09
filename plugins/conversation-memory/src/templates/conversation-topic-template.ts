import type { Template } from "@brains/content-generator";
import { StructuredContentFormatter } from "@brains/utils";
import {
  conversationTopicOutputSchema,
  type ConversationTopicOutput,
} from "../schemas/topic";
import promptTemplate from "./conversation-topic.prompt.txt";

// Configuration for the structured content formatter
const formatterConfig = {
  title: "Topic Summary",
  mappings: [
    {
      key: "keyTakeaways",
      label: "Key Takeaways",
      type: "array" as const,
      itemType: "string" as const,
    },
    {
      key: "context",
      label: "Context",
      type: "string" as const,
    },
    {
      key: "summary",
      label: "Summary",
      type: "string" as const,
    },
  ],
};

// Create the formatter instance
const topicFormatter = new StructuredContentFormatter(
  conversationTopicOutputSchema,
  formatterConfig,
);

/**
 * Template for generating conversation topic summaries
 */
export const conversationTopicTemplate: Template<ConversationTopicOutput> = {
  name: "conversation-topic",
  description: "Generate a topical summary of conversation messages",
  schema: conversationTopicOutputSchema,
  requiredPermission: "trusted" as const,
  basePrompt: promptTemplate,

  // Use the structured content formatter
  formatter: topicFormatter,
};
