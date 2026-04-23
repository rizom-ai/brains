import { BaseEntityAdapter } from "@brains/plugins";
import {
  skillEntitySchema,
  skillFrontmatterSchema,
  type SkillEntity,
  type SkillFrontmatter,
  type SkillMetadata,
} from "../schemas/skill";

/**
 * Entity adapter for skill entities.
 * Skills are frontmatter-only — no body content.
 */
export class SkillAdapter extends BaseEntityAdapter<
  SkillEntity,
  SkillMetadata
> {
  constructor() {
    super({
      entityType: "skill",
      schema: skillEntitySchema,
      frontmatterSchema: skillFrontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<SkillEntity> {
    const frontmatter = this.parseFrontMatter(markdown, skillFrontmatterSchema);

    return {
      content: markdown,
      entityType: "skill",
      metadata: frontmatter,
    };
  }

  /**
   * Build markdown content from skill data.
   */
  public createSkillContent(input: SkillFrontmatter): string {
    return this.buildMarkdown("", input);
  }
}
