import { BaseEntityAdapter } from "@brains/plugins";
import type { SiteContent, SiteContentMetadata } from "../schemas/site-content";
import {
  siteContentSchema,
  siteContentMetadataSchema,
} from "../schemas/site-content";

export class SiteContentAdapter extends BaseEntityAdapter<
  SiteContent,
  SiteContentMetadata
> {
  constructor() {
    super({
      entityType: "site-content",
      schema: siteContentSchema,
      frontmatterSchema: siteContentMetadataSchema,
    });
  }

  public toMarkdown(entity: SiteContent): string {
    const body = this.extractBody(entity.content);
    return this.buildMarkdown(body, entity.metadata);
  }

  public fromMarkdown(markdown: string): Partial<SiteContent> {
    return {
      content: markdown,
      entityType: "site-content",
      metadata: this.parseFrontmatter(markdown),
    };
  }
}

export const siteContentAdapter = new SiteContentAdapter();
