import { BaseEntityAdapter } from "@brains/plugins";
import type { z } from "@brains/utils";
import {
  topicEntitySchema,
  topicFrontmatterSchema,
  type TopicEntity,
  type TopicBody,
  type TopicMetadata,
} from "../schemas/topic";

type TopicFrontmatter = z.infer<typeof topicFrontmatterSchema>;

export class TopicAdapter extends BaseEntityAdapter<
  TopicEntity,
  TopicMetadata,
  TopicFrontmatter
> {
  constructor() {
    super({
      entityType: "topic",
      schema: topicEntitySchema,
      frontmatterSchema: topicFrontmatterSchema,
    });
  }

  private buildFrontmatter(
    title: string,
    keywords: string[],
  ): Record<string, unknown> {
    return {
      title,
      ...(keywords.length > 0 && { keywords }),
    };
  }

  public toMarkdown(entity: TopicEntity): string {
    const parsed = this.parseTopicBody(entity.content);
    return this.buildMarkdown(
      parsed.content,
      this.buildFrontmatter(parsed.title, parsed.keywords),
    );
  }

  public fromMarkdown(markdown: string): Partial<TopicEntity> {
    return {
      content: markdown,
      entityType: "topic",
      metadata: {},
    };
  }

  public override extractMetadata(_entity: TopicEntity): TopicMetadata {
    return {};
  }

  public override generateFrontMatter(entity: TopicEntity): string {
    const parsed = this.parseTopicBody(entity.content);
    const fullMarkdown = this.buildMarkdown(
      "",
      this.buildFrontmatter(parsed.title, parsed.keywords),
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
          keywords: frontmatter.keywords ?? [],
          formatted: body,
          title: frontmatter.title,
        };
      } catch {
        return {
          content: body,
          keywords: [],
          formatted: body,
          title: "Unknown Topic",
        };
      }
    }

    return {
      content: body,
      keywords: [],
      formatted: body,
      title: "Unknown Topic",
    };
  }

  public createTopicBody(params: {
    title: string;
    content: string;
    keywords: string[];
  }): string {
    return this.buildMarkdown(
      params.content,
      this.buildFrontmatter(params.title, params.keywords),
    );
  }
}
