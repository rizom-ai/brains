import type { z } from "zod";
import type { EntityAdapter } from "@brains/plugins";
import matter from "gray-matter";
import {
  conversationTopicSchema,
  topicMetadataSchema,
  type ConversationTopic,
} from "../schemas/topic";

/**
 * Entity adapter for conversation topics
 * Topics are global knowledge entities that grow across interactions
 */
export class ConversationTopicAdapter
  implements EntityAdapter<ConversationTopic>
{
  public readonly entityType = "conversation-topic";
  public readonly schema = conversationTopicSchema;

  toMarkdown(entity: ConversationTopic): string {
    // Extract key fields for frontmatter
    const metadata = entity.metadata;
    const frontmatter = {
      title: metadata.title,
      messageCount: metadata.messageCount,
      lastUpdated: metadata.lastUpdated,
    };

    // Use gray-matter to properly format with frontmatter
    return matter.stringify(entity.content, frontmatter);
  }

  fromMarkdown(markdown: string): Partial<ConversationTopic> {
    const { data, content } = matter(markdown);

    // Parse frontmatter with the schema
    const metadata = topicMetadataSchema.parse(data);

    return {
      content: content.trim(),
      metadata,
    };
  }

  extractMetadata(entity: ConversationTopic): Record<string, unknown> {
    return {
      ...entity.metadata,
      entityType: this.entityType,
    };
  }

  parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    const { data } = matter(markdown);
    return schema.parse(data);
  }

  generateFrontMatter(entity: ConversationTopic): string {
    const metadata = entity.metadata;
    const frontmatter = {
      title: metadata.title,
      messageCount: metadata.messageCount,
      lastUpdated: metadata.lastUpdated,
    };

    // Generate just the frontmatter portion
    const fullMarkdown = matter.stringify("", frontmatter);
    return fullMarkdown.split("\n---\n")[0] + "\n---";
  }
}