import { BaseEntityAdapter } from "@brains/plugins";
import {
  newsletterSchema,
  newsletterFrontmatterSchema,
  type Newsletter,
  type NewsletterMetadata,
} from "../schemas/newsletter";

/**
 * Adapter for newsletter entities
 * Stores metadata in frontmatter, content body contains newsletter HTML/markdown
 */
export class NewsletterAdapter extends BaseEntityAdapter<
  Newsletter,
  NewsletterMetadata
> {
  constructor() {
    super({
      entityType: "newsletter",
      schema: newsletterSchema,
      frontmatterSchema: newsletterFrontmatterSchema,
    });
  }

  public toMarkdown(entity: Newsletter): string {
    const body = this.extractBody(entity.content);
    return this.buildMarkdown(body, entity.metadata);
  }

  public fromMarkdown(markdown: string): Partial<Newsletter> {
    const metadata = this.parseFrontmatter(markdown);
    return {
      entityType: "newsletter",
      content: markdown,
      metadata,
    };
  }
}

export const newsletterAdapter = new NewsletterAdapter();
