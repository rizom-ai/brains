import type { EntityAdapter } from "@brains/base-entity";
import { siteContentSchema, type SiteContent } from "./schemas";
import * as yaml from "js-yaml";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/utils";
import { z } from "zod";

// Schema for parsing frontmatter
const frontmatterSchema = z.object({
  page: z.string(),
  section: z.string(),
});

export const siteContentAdapter: EntityAdapter<SiteContent> = {
  entityType: "site-content",
  schema: siteContentSchema,

  toMarkdown: (entity: SiteContent): string => {
    // For site-content, the 'data' field is stored as YAML in the content
    // and page/section go in frontmatter
    const metadata = {
      page: entity.page,
      section: entity.section,
    };
    const dataYaml = yaml.dump(entity.data, { indent: 2 });

    // Use frontmatter utility to generate markdown with metadata
    return generateMarkdownWithFrontmatter(dataYaml, metadata);
  },

  fromMarkdown: (markdown: string): Partial<SiteContent> => {
    // Parse frontmatter and content
    const { content, metadata } = parseMarkdownWithFrontmatter(
      markdown,
      frontmatterSchema,
    );

    // Parse YAML content back to data object
    let parsedData = {};
    try {
      parsedData = yaml.load(content) as Record<string, unknown>;
    } catch {
      // If YAML parsing fails, treat content as plain text
      parsedData = { content };
    }

    return {
      page: metadata.page,
      section: metadata.section,
      data: parsedData,
    };
  },

  extractMetadata: (entity: SiteContent): Record<string, unknown> => {
    return {
      page: entity.page,
      section: entity.section,
    };
  },

  parseFrontMatter: <TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter => {
    const { metadata } = parseMarkdownWithFrontmatter(markdown, schema);
    return metadata;
  },

  generateFrontMatter: (entity: SiteContent): string => {
    const metadata = {
      page: entity.page,
      section: entity.section,
    };
    return generateFrontmatter(metadata);
  },
};
