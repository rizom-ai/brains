import { BaseEntityAdapter } from "@brains/plugins";
import { type z, SourceListFormatter } from "@brains/utils";
import {
  topicEntitySchema,
  topicFrontmatterSchema,
  type TopicEntity,
  type TopicBody,
  type TopicSource,
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

  private buildBody(content: string, sources: TopicSource[]): string {
    if (sources.length === 0) return content;
    return content + "\n\n## Sources\n" + SourceListFormatter.format(sources);
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
    const body = this.buildBody(parsed.content, parsed.sources);
    return this.buildMarkdown(
      body,
      this.buildFrontmatter(parsed.title, parsed.keywords),
    );
  }

  public fromMarkdown(markdown: string): Partial<TopicEntity> {
    const content = markdown;
    const sourcesSection = SourceListFormatter.extractSection(content);
    const sources = sourcesSection
      ? SourceListFormatter.parse(sourcesSection)
      : [];

    return {
      content,
      entityType: "topic",
      metadata: {
        sources: sources.length > 0 ? sources : undefined,
      },
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
    // Extract just the frontmatter block (between --- markers)
    const match = fullMarkdown.match(/^---\n[\s\S]*?\n---/);
    return match ? match[0] : "";
  }

  public parseTopicBody(
    body: string,
  ): TopicBody & { formatted: string; title: string } {
    // Frontmatter format
    if (body.startsWith("---")) {
      try {
        const frontmatter = this.parseFrontmatter(body);
        const bodyText = this.extractBody(body);

        // Extract content (everything before ## Sources)
        const contentText = bodyText
          .replace(/\n*## Sources[\s\S]*$/, "")
          .trim();

        // Extract sources from body
        const sourcesSection = SourceListFormatter.extractSection(bodyText);
        const sources = sourcesSection
          ? SourceListFormatter.parse(sourcesSection)
          : [];

        return {
          content: contentText,
          keywords: frontmatter.keywords ?? [],
          sources,
          formatted: body,
          title: frontmatter.title,
        };
      } catch {
        return {
          content: body,
          keywords: [],
          sources: [],
          formatted: body,
          title: "Unknown Topic",
        };
      }
    }

    // Non-frontmatter content — return as raw content
    return {
      content: body,
      keywords: [],
      sources: [],
      formatted: body,
      title: "Unknown Topic",
    };
  }

  public createTopicBody(params: {
    title: string;
    content: string;
    keywords: string[];
    sources: TopicSource[];
  }): string {
    const body = this.buildBody(params.content, params.sources);
    return this.buildMarkdown(
      body,
      this.buildFrontmatter(params.title, params.keywords),
    );
  }
}
