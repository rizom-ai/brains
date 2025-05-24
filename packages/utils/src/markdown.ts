import matter from "gray-matter";

/**
 * Parse frontmatter and content from markdown
 */
export function parseMarkdown(markdown: string): {
  frontmatter: Record<string, unknown>;
  content: string;
} {
  const { data, content } = matter(markdown);
  return { 
    frontmatter: data as Record<string, unknown>, 
    content: content.trim() 
  };
}

/**
 * Extract title from markdown content using the hierarchy:
 * 1. Frontmatter title field
 * 2. First # heading
 * 3. First non-empty line (truncated to 50 chars)
 * 4. Entity ID as fallback
 */
export function extractTitle(
  markdown: string,
  entityId: string
): string {
  const { frontmatter, content } = parseMarkdown(markdown);
  
  // 1. Check frontmatter title
  if (frontmatter["title"] && typeof frontmatter["title"] === "string") {
    return frontmatter["title"].trim();
  }
  
  // 2. Check for first # heading
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch && headingMatch[1]) {
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
  entityId: string
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
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
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
  content: string
): string {
  return matter.stringify(content, frontmatter);
}