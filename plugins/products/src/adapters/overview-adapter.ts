import type { EntityAdapter } from "@brains/plugins";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/plugins";
import { z, slugify } from "@brains/utils";
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
export class OverviewAdapter
  implements EntityAdapter<Overview, OverviewMetadata>
{
  public readonly entityType = "products-overview" as const;
  public readonly schema = overviewSchema;

  public toMarkdown(entity: Overview): string {
    let contentBody = entity.content;
    try {
      const parsed = parseMarkdownWithFrontmatter(entity.content, z.object({}));
      contentBody = parsed.content;
    } catch {
      // Content doesn't have frontmatter, use as-is
    }

    try {
      const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
        entity.content,
        overviewFrontmatterSchema,
      );
      return generateMarkdownWithFrontmatter(contentBody, frontmatter);
    } catch {
      return contentBody;
    }
  }

  public fromMarkdown(markdown: string): Partial<Overview> {
    const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
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

  public extractMetadata(entity: Overview): OverviewMetadata {
    return entity.metadata;
  }

  public parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    const { metadata } = parseMarkdownWithFrontmatter(markdown, schema);
    return metadata;
  }

  public generateFrontMatter(entity: Overview): string {
    try {
      const { metadata } = parseMarkdownWithFrontmatter(
        entity.content,
        overviewFrontmatterSchema,
      );
      return generateFrontmatter(metadata);
    } catch {
      return "";
    }
  }
}

export const overviewAdapter = new OverviewAdapter();
