import { BaseEntityAdapter } from "@brains/plugins";
import { slugify } from "@brains/utils";
import {
  promptSchema,
  promptFrontmatterSchema,
  type Prompt,
  type PromptMetadata,
} from "../schemas/prompt";

/**
 * Entity adapter for prompt entities.
 * Prompts are markdown files with title + target in frontmatter
 * and the prompt text as the body.
 */
export class PromptAdapter extends BaseEntityAdapter<Prompt, PromptMetadata> {
  constructor() {
    super({
      entityType: "prompt",
      schema: promptSchema,
      frontmatterSchema: promptFrontmatterSchema,
    });
  }

  public toMarkdown(entity: Prompt): string {
    const body = this.extractBody(entity.content);
    const frontmatter = this.parseFrontMatter(
      entity.content,
      promptFrontmatterSchema,
    );
    return this.buildMarkdown(body, frontmatter);
  }

  public fromMarkdown(markdown: string): Partial<Prompt> {
    const frontmatter = this.parseFrontMatter(
      markdown,
      promptFrontmatterSchema,
    );
    const slug = slugify(frontmatter.target.replace(/:/g, "-"));

    return {
      content: markdown,
      entityType: "prompt",
      metadata: {
        title: frontmatter.title,
        target: frontmatter.target,
        slug,
      },
    };
  }
}

export const promptAdapter = new PromptAdapter();
