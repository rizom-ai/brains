import type { z } from "@brains/utils";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
} from "./frontmatter";

/**
 * Interface for legacy content parsers (e.g., StructuredContentFormatter)
 */
interface LegacyContentParser<T> {
  parse(content: string): T;
}

/**
 * Helper for adapters migrating from StructuredContentFormatter to frontmatter format.
 *
 * Handles dual-format reading (frontmatter-first, legacy fallback) and
 * always writes frontmatter format. Auto-converts legacy content on read.
 *
 * @template T - The body data type (must be a plain object for frontmatter serialization)
 */
export class FrontmatterContentHelper<T extends Record<string, unknown>> {
  constructor(
    private readonly schema: z.ZodType<T>,
    private readonly createLegacyParser: () => LegacyContentParser<T>,
  ) {}

  /**
   * Parse content from either frontmatter or legacy structured format
   */
  parse(content: string): T {
    if (content.startsWith("---")) {
      const { metadata } = parseMarkdownWithFrontmatter(content, this.schema);
      return metadata;
    }
    return this.createLegacyParser().parse(content);
  }

  /**
   * Format data as frontmatter markdown (with optional body below frontmatter)
   */
  format(data: T, body = ""): string {
    return generateMarkdownWithFrontmatter(body, data);
  }

  /**
   * Generate just the frontmatter block (--- delimited) without body
   */
  toFrontmatterString(data: T): string {
    return generateFrontmatter(data);
  }

  /**
   * Convert markdown content to frontmatter format.
   * Passes through content that's already frontmatter.
   * Parses and re-serializes legacy structured content.
   */
  convertToFrontmatter(markdown: string): string {
    if (markdown.startsWith("---")) {
      return markdown;
    }
    const data = this.createLegacyParser().parse(markdown);
    return generateMarkdownWithFrontmatter("", data);
  }
}
