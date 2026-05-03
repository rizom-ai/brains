import { BaseEntityAdapter } from "@brains/plugins";
import type { z } from "@brains/utils";
import {
  topicEntitySchema,
  topicFrontmatterSchema,
  type TopicEntity,
  type TopicBody,
  type TopicMetadata,
} from "../schemas/topic";
import { TOPIC_ENTITY_TYPE } from "./constants";

type TopicFrontmatter = z.infer<typeof topicFrontmatterSchema>;

export class TopicAdapter extends BaseEntityAdapter<
  TopicEntity,
  TopicMetadata,
  TopicFrontmatter
> {
  constructor() {
    super({
      entityType: TOPIC_ENTITY_TYPE,
      schema: topicEntitySchema,
      frontmatterSchema: topicFrontmatterSchema,
    });
  }

  private buildFrontmatter(title: string): Record<string, unknown> {
    return { title };
  }

  public override toMarkdown(entity: TopicEntity): string {
    const parsed = this.parseTopicBody(entity.content);
    return this.buildMarkdown(
      parsed.content,
      this.buildFrontmatter(parsed.title),
    );
  }

  public fromMarkdown(markdown: string): Partial<TopicEntity> {
    return {
      content: markdown,
      entityType: TOPIC_ENTITY_TYPE,
    };
  }

  public override extractMetadata(entity: TopicEntity): TopicMetadata {
    return {
      aliases: entity.metadata.aliases ?? [],
    };
  }

  public override generateFrontMatter(entity: TopicEntity): string {
    const parsed = this.parseTopicBody(entity.content);
    const fullMarkdown = this.buildMarkdown(
      "",
      this.buildFrontmatter(parsed.title),
    );
    const match = fullMarkdown.match(/^---\n[\s\S]*?\n---/);
    return match ? match[0] : "";
  }

  public parseTopicBody(
    body: string,
  ): TopicBody & { formatted: string; title: string } {
    if (body.startsWith("---")) {
      try {
        const frontmatter = this.parseFrontmatter(body);
        const bodyText = this.extractBody(body);

        // Strip legacy ## Sources section from old entities
        const contentText = bodyText
          .replace(/\n*## Sources[\s\S]*$/, "")
          .trim();

        return {
          content: contentText,
          formatted: body,
          title: frontmatter.title,
        };
      } catch {
        return {
          content: body,
          formatted: body,
          title: "Unknown Topic",
        };
      }
    }

    return {
      content: body,
      formatted: body,
      title: "Unknown Topic",
    };
  }

  public createTopicBody(params: { title: string; content: string }): string {
    return this.buildMarkdown(
      params.content,
      this.buildFrontmatter(params.title),
    );
  }
}
