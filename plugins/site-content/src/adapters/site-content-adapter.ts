import { BaseEntityAdapter } from "@brains/plugins";
import type { SiteContent, SiteContentMetadata } from "../schemas/site-content";
import {
  siteContentSchema,
  siteContentMetadataSchema,
} from "../schemas/site-content";

/**
 * Entity adapter for site content
 * routeId and sectionId identify which route/section this content belongs to
 */
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
    const fm = {
      routeId: entity.metadata.routeId,
      sectionId: entity.metadata.sectionId,
    };

    try {
      const body = this.extractBody(entity.content);
      return this.buildMarkdown(body, fm);
    } catch {
      return this.buildMarkdown(entity.content, fm);
    }
  }

  public fromMarkdown(markdown: string): Partial<SiteContent> {
    const frontmatter = this.parseFrontmatter(markdown);
    return {
      content: markdown,
      entityType: "site-content",
      metadata: {
        routeId: frontmatter.routeId,
        sectionId: frontmatter.sectionId,
      },
    };
  }
}

export const siteContentAdapter = new SiteContentAdapter();
