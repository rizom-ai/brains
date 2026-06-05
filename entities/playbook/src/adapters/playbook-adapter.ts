import { BaseEntityAdapter } from "@brains/plugins";
import { playbookBodyFormatter } from "../formatters/playbook-formatter";
import {
  playbookFrontmatterSchema,
  playbookSchema,
  type PlaybookBody,
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
    body: PlaybookBody,
  ): string {
    return this.buildMarkdown(playbookBodyFormatter.format(body), frontmatter);
  }

  public parsePlaybookContent(content: string): {
    frontmatter: PlaybookFrontmatter;
    body: PlaybookBody;
    bodyMarkdown: string;
  } {
    const raw = this.parseFrontMatter(content, playbookFrontmatterSchema);
    const bodyMarkdown = this.extractBody(content).trim();
    return {
      frontmatter: playbookFrontmatterSchema.parse(raw),
      body: playbookBodyFormatter.parse(bodyMarkdown),
      bodyMarkdown,
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
