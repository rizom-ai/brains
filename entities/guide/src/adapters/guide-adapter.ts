import { BaseEntityAdapter } from "@brains/plugins";
import { guideSchema, type Guide, type GuideMetadata } from "../schemas/guide";
import {
  guideFrontmatterSchema,
  type GuideFrontmatter,
} from "../schemas/guide-frontmatter";

export class GuideAdapter extends BaseEntityAdapter<
  Guide,
  GuideMetadata,
  GuideFrontmatter
> {
  constructor() {
    super({
      entityType: "guide",
      purpose:
        "A moving-in guide: how one kind of user brings their material and habits into a brain.",
      schema: guideSchema,
      frontmatterSchema: guideFrontmatterSchema,
    });
  }

  public override toMarkdown(entity: Guide): string {
    const body = this.extractBody(entity.content);
    const frontmatter = this.parseFrontMatter(
      entity.content,
      guideFrontmatterSchema,
    );
    return this.buildMarkdown(body, frontmatter);
  }

  public fromMarkdown(markdown: string): Partial<Guide> {
    const frontmatter = this.parseFrontMatter(markdown, guideFrontmatterSchema);

    return {
      content: markdown,
      entityType: "guide",
      metadata: frontmatter,
    };
  }
}

export const guideAdapter: GuideAdapter = new GuideAdapter();
