import { BaseEntityAdapter } from "@brains/plugins";
import {
  playbookFrontmatterSchema,
  playbookSchema,
  type PlaybookEntity,
  type PlaybookFrontmatter,
  type PlaybookMetadata,
} from "../schemas/playbook";

export class PlaybookAdapter extends BaseEntityAdapter<
  PlaybookEntity,
  PlaybookMetadata
> {
  constructor() {
    super({
      entityType: "playbook",
      schema: playbookSchema,
      frontmatterSchema: playbookFrontmatterSchema,
    });
  }

  public createPlaybookContent(
    frontmatter: PlaybookFrontmatter,
    body: string,
  ): string {
    return this.buildMarkdown(body, frontmatter);
  }

  public parsePlaybookContent(content: string): {
    frontmatter: PlaybookFrontmatter;
    body: string;
  } {
    const raw = this.parseFrontMatter(content, playbookFrontmatterSchema);
    return {
      frontmatter: playbookFrontmatterSchema.parse(raw),
      body: this.extractBody(content).trim(),
    };
  }

  public fromMarkdown(markdown: string): Partial<PlaybookEntity> {
    const { frontmatter } = this.parsePlaybookContent(markdown);
    return {
      content: markdown,
      entityType: "playbook",
      metadata: {
        title: frontmatter.title,
        status: frontmatter.status,
        audience: frontmatter.audience,
        ...(frontmatter.trigger ? { trigger: frontmatter.trigger } : {}),
        completionMode: frontmatter.completionMode,
      },
    };
  }
}

export const playbookAdapter = new PlaybookAdapter();
