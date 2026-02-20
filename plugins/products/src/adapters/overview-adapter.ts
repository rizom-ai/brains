import { BaseEntityAdapter } from "@brains/plugins";
import { slugify } from "@brains/utils";
import {
  overviewSchema,
  overviewFrontmatterSchema,
  type Overview,
  type OverviewMetadata,
} from "../schemas/overview";

/**
 * Entity adapter for products-overview entities.
 * Frontmatter holds headline/tagline. Body holds structured content
 * sections (vision, pillars, technologies, benefits, CTA) parsed
 * by OverviewBodyFormatter in the datasource layer.
 */
export class OverviewAdapter extends BaseEntityAdapter<
  Overview,
  OverviewMetadata
> {
  constructor() {
    super({
      entityType: "products-overview",
      schema: overviewSchema,
      frontmatterSchema: overviewFrontmatterSchema,
    });
  }

  public toMarkdown(entity: Overview): string {
    const body = this.extractBody(entity.content);
    try {
      const frontmatter = this.parseFrontMatter(
        entity.content,
        overviewFrontmatterSchema,
      );
      return this.buildMarkdown(body, frontmatter);
    } catch {
      return body;
    }
  }

  public fromMarkdown(markdown: string): Partial<Overview> {
    const frontmatter = this.parseFrontMatter(
      markdown,
      overviewFrontmatterSchema,
    );
    const slug = slugify(frontmatter.headline);

    return {
      content: markdown,
      entityType: "products-overview",
      metadata: {
        headline: frontmatter.headline,
        slug,
      },
    };
  }
}

export const overviewAdapter = new OverviewAdapter();
