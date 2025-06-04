import type { EntityAdapter } from "@brains/types";
import { siteContentSchema, type SiteContent } from "./schemas";
import * as yaml from "js-yaml";
import {
  createFrontmatterAdapter,
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  type FrontmatterConfig,
} from "@brains/utils";

// Configuration for site-content frontmatter
const siteContentConfig: FrontmatterConfig<SiteContent> = {
  // Only include entity-specific fields in frontmatter
  includeFields: ["page", "section"],
};

// Create frontmatter adapter with site-content config
const frontmatterAdapter = createFrontmatterAdapter(siteContentConfig);

export const siteContentAdapter: EntityAdapter<SiteContent> = {
  entityType: "site-content",
  schema: siteContentSchema,

  toMarkdown: (entity: SiteContent): string => {
    // For site-content, the 'data' field is stored as YAML in the content
    // and page/section go in frontmatter
    const metadata = frontmatterAdapter.extractMetadata(entity);
    const dataYaml = yaml.dump(entity.data, { indent: 2 });

    // Use frontmatter utility to generate markdown with metadata
    return generateMarkdownWithFrontmatter(dataYaml, metadata);
  },

  fromMarkdown: (markdown: string): Partial<SiteContent> => {
    // Parse frontmatter and content
    const { content, metadata } = parseMarkdownWithFrontmatter(markdown);

    // Parse YAML content back to data object
    let parsedData = {};
    try {
      parsedData = yaml.load(content) as Record<string, unknown>;
    } catch {
      // If YAML parsing fails, treat content as plain text
      parsedData = { content };
    }

    return {
      page: metadata["page"] as string,
      section: metadata["section"] as string,
      data: parsedData,
    };
  },

  extractMetadata: (entity: SiteContent): Record<string, unknown> => {
    return frontmatterAdapter.extractMetadata(entity);
  },

  parseFrontMatter: (markdown: string): Record<string, unknown> => {
    return frontmatterAdapter.parseFrontMatter(markdown);
  },

  generateFrontMatter: (entity: SiteContent): string => {
    return frontmatterAdapter.generateFrontMatter(entity);
  },
};
