import matter from "gray-matter";
import { marked } from "marked";
import { remark } from "remark";
import { toString } from "mdast-util-to-string";
import { visit } from "unist-util-visit";
import type { Image } from "mdast";

/**
 * Parse frontmatter and content from markdown
 * Note: We spread the data object to create a shallow copy because gray-matter
 * caches parsed results and returns the same object reference for identical inputs.
 * Without this copy, mutations to frontmatter would pollute the cache.
 */
export function parseMarkdown(markdown: string): {
  frontmatter: Record<string, unknown>;
  content: string;
} {
  const { data, content } = matter(markdown);
  return {
    frontmatter: { ...data },
    content: content.trim(),
  };
}

/**
 * Extract title from markdown content using the hierarchy:
 * 1. Frontmatter title field
 * 2. First # heading
 * 3. First non-empty line (truncated to 50 chars)
 * 4. Entity ID as fallback
 */
export function extractTitle(markdown: string, entityId: string): string {
  const { frontmatter, content } = parseMarkdown(markdown);

  // 1. Check frontmatter title
  if (frontmatter["title"] && typeof frontmatter["title"] === "string") {
    return frontmatter["title"].trim();
  }

  // 2. Check for first # heading
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch?.[1]) {
    return headingMatch[1].trim();
  }

  // 3. Use first non-empty line (truncated)
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith("#")) {
      // Remove common markdown formatting
      const cleaned = trimmed
        .replace(/\*\*(.*?)\*\*/g, "$1") // Remove bold
        .replace(/\*(.*?)\*/g, "$1") // Remove italic
        .replace(/`(.*?)`/g, "$1") // Remove inline code
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Extract link text
        .trim();

      // Truncate to reasonable length
      if (cleaned.length > 50) {
        return cleaned.substring(0, 47) + "...";
      }
      return cleaned;
    }
  }

  // 4. Fallback to entity ID
  return entityId;
}

/**
 * Extract indexed fields from markdown for database storage
 */
export function extractIndexedFields(
  markdown: string,
  entityId: string,
): {
  title: string;
  tags: string[];
  contentWeight: number;
} {
  const { frontmatter } = parseMarkdown(markdown);

  // Extract title using hierarchy
  const title = extractTitle(markdown, entityId);

  // Extract tags (ensure it's an array of strings)
  let tags: string[] = [];
  if (Array.isArray(frontmatter["tags"])) {
    tags = frontmatter["tags"]
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  // Extract contentWeight (default to 1.0 for user content)
  let contentWeight = 1.0;
  if (typeof frontmatter["contentWeight"] === "number") {
    contentWeight = Math.max(0, Math.min(1, frontmatter["contentWeight"]));
  }

  return { title, tags, contentWeight };
}

/**
 * Generate markdown with frontmatter
 */
export function generateMarkdown(
  frontmatter: Record<string, unknown>,
  content: string,
): string {
  return matter.stringify(content, frontmatter);
}

/**
 * Convert markdown to HTML
 * Uses marked for conversion with sensible defaults
 */
export function markdownToHtml(markdown: string): string {
  // Configure marked with sensible defaults if not already configured
  marked.setOptions({
    gfm: true, // GitHub Flavored Markdown
    breaks: true, // Convert line breaks to <br>
    pedantic: false, // Don't conform to original markdown.pl
  });

  let html = marked(markdown) as string;

  // Post-process: wrap attribution lines after blockquotes in <cite>
  // Matches </blockquote> followed by <p> starting with emdash (—) or double hyphen (--)
  // Captures the emdash and the rest of the paragraph content until </p>
  // Uses [\s\S]*? to match any content including HTML tags (like <a>)
  html = html.replace(
    /<\/blockquote>\s*<p>(—|--|–)([\s\S]*?)<\/p>/g,
    '</blockquote>\n<cite class="block-attribution"><span class="emdash">$1</span>$2</cite>',
  );

  return html;
}

/**
 * Strip markdown formatting from text to get plain text
 */
export function stripMarkdown(text: string): string {
  const tree = remark().parse(text);
  return toString(tree);
}

/**
 * Extracted image info from markdown content
 */
export interface ExtractedImage {
  /** The image URL */
  url: string;
  /** The alt text (empty string if not provided) */
  alt: string;
  /** Optional title attribute */
  title?: string | undefined;
  /** Start position in the original content */
  position?:
    | {
        start: { line: number; column: number; offset: number };
        end: { line: number; column: number; offset: number };
      }
    | undefined;
}

/**
 * Extract all images from markdown content using AST parsing
 * Automatically excludes images inside code blocks
 *
 * @param markdown The markdown content to parse
 * @returns Array of extracted image information
 */
export function extractMarkdownImages(markdown: string): ExtractedImage[] {
  const images: ExtractedImage[] = [];

  const tree = remark().parse(markdown);

  visit(tree, "image", (node: Image) => {
    images.push({
      url: node.url,
      alt: node.alt ?? "",
      title: node.title ?? undefined,
      position: node.position
        ? {
            start: {
              line: node.position.start.line,
              column: node.position.start.column,
              offset: node.position.start.offset ?? 0,
            },
            end: {
              line: node.position.end.line,
              column: node.position.end.column,
              offset: node.position.end.offset ?? 0,
            },
          }
        : undefined,
    });
  });

  return images;
}

/**
 * Update a single field in frontmatter, preserving all other fields
 */
export function updateFrontmatterField(
  markdown: string,
  field: string,
  value: unknown,
): string {
  const { frontmatter, content } = parseMarkdown(markdown);
  if (value === null || value === undefined) {
    delete frontmatter[field];
  } else {
    frontmatter[field] = value;
  }
  return generateMarkdown(frontmatter, content);
}

/**
 * Get cover image ID from any entity that stores it in frontmatter
 */
export function getCoverImageId(entity: { content: string }): string | null {
  const { frontmatter } = parseMarkdown(entity.content);
  const coverImageId = frontmatter["coverImageId"];
  return typeof coverImageId === "string" ? coverImageId : null;
}

/**
 * Set cover image ID on any entity, returns new entity with updated content
 */
export function setCoverImageId<T extends { content: string }>(
  entity: T,
  imageId: string | null,
): T {
  const updatedContent = updateFrontmatterField(
    entity.content,
    "coverImageId",
    imageId,
  );
  return { ...entity, content: updatedContent };
}
