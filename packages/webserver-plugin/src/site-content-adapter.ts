import type { EntityAdapter } from "@brains/types";
import { siteContentSchema, type SiteContent } from "./schemas";
import * as yaml from "js-yaml";
import matter from "gray-matter";

export const siteContentAdapter: EntityAdapter<SiteContent> = {
  entityType: "site-content",
  schema: siteContentSchema,

  toMarkdown: (entity: SiteContent): string => {
    const frontmatter = {
      page: entity.page,
      section: entity.section,
    };

    // Convert data to YAML format in the content
    const dataYaml = yaml.dump(entity.data, { indent: 2 });

    return matter.stringify(dataYaml, frontmatter);
  },

  fromMarkdown: (markdown: string): Partial<SiteContent> => {
    const { data: frontmatter, content } = matter(markdown);

    // Parse YAML content back to data object
    let parsedData = {};
    try {
      parsedData = yaml.load(content) as Record<string, unknown>;
    } catch {
      // If YAML parsing fails, treat content as plain text
      parsedData = { content };
    }

    return {
      page: frontmatter["page"] as string,
      section: frontmatter["section"] as string,
      data: parsedData,
    };
  },

  extractMetadata: (entity: SiteContent): Record<string, unknown> => ({
    page: entity.page,
    section: entity.section,
  }),

  parseFrontMatter: (markdown: string): Record<string, unknown> => {
    const { data } = matter(markdown);
    return data;
  },

  generateFrontMatter: (entity: SiteContent): string => {
    return matter
      .stringify("", {
        page: entity.page,
        section: entity.section,
      })
      .trim();
  },
};
