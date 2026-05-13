import matter from "gray-matter";
import { Marked } from "marked";
import { remark } from "remark";
import { toString } from "mdast-util-to-string";
const remarkProcessor = remark();

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
  contentWeight: number;
} {
  const { frontmatter } = parseMarkdown(markdown);

  // Extract title using hierarchy
  const title = extractTitle(markdown, entityId);

  // Extract contentWeight (default to 1.0 for user content)
  let contentWeight = 1.0;
  if (typeof frontmatter["contentWeight"] === "number") {
    contentWeight = Math.max(0, Math.min(1, frontmatter["contentWeight"]));
  }

  return { title, contentWeight };
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
 * Custom image renderer function.
 * Return a string to override the default rendering, or undefined to use the default.
 */
export type ImageRenderer = (
  href: string,
  title: string | null,
  text: string,
) => string | undefined;

export interface MarkdownToHtmlOptions {
  /** Custom image renderer for optimized/responsive images */
  imageRenderer?: ImageRenderer;
}

/**
 * Convert markdown to HTML
 * Uses marked for conversion with sensible defaults.
 *
 * @param markdown The markdown content to convert
 * @param options Optional configuration (e.g. custom image renderer)
 * @returns HTML string
 */
const defaultMarked = new Marked({ gfm: true, breaks: true });
const rendererCache = new WeakMap<ImageRenderer, Marked>();

function getMarkedInstance(imageRenderer?: ImageRenderer): Marked {
  if (!imageRenderer) return defaultMarked;

  let instance = rendererCache.get(imageRenderer);
  if (!instance) {
    instance = new Marked({ gfm: true, breaks: true });
    instance.use({
      renderer: {
        image(
          href: string,
          title: string | null,
          text: string,
        ): string | false {
          return imageRenderer(href, title, text) ?? false;
        },
      },
    });
    rendererCache.set(imageRenderer, instance);
  }
  return instance;
}

export function markdownToHtml(
  markdown: string,
  options?: MarkdownToHtmlOptions,
): string {
  const instance = getMarkedInstance(options?.imageRenderer);

  let html = instance.parse(markdown) as string;

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
  const tree = remarkProcessor.parse(text);
  return toString(tree);
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
