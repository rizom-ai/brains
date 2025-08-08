import type { z } from "zod";
import type { BaseEntity, EntityAdapter } from "@brains/plugins";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Simple entity adapter for conversation summaries
 * Uses BaseEntity since we don't need additional fields
 */
export class ConversationSummaryAdapter implements EntityAdapter<BaseEntity> {
  public readonly entityType = "conversation-summary";
  public readonly schema = baseEntitySchema;

  toMarkdown(entity: BaseEntity): string {
    return entity.content;
  }

  fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { content: markdown };
  }

  extractMetadata(entity: BaseEntity): Record<string, unknown> {
    return entity.metadata ?? {};
  }

  parseFrontMatter<TFrontmatter>(
    _markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    // No frontmatter for conversation summaries
    return schema.parse({});
  }

  generateFrontMatter(_entity: BaseEntity): string {
    return "";
  }
}
