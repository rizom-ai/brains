import {
  generateMarkdownWithFrontmatter,
  parseMarkdown,
} from "@brains/sdk/entities";
import {
  linkFrontmatterSchema,
  type LinkFrontmatter,
  type LinkSource,
} from "../schemas/link";

/**
 * A link keeps most of what it knows in content frontmatter rather than in
 * metadata: only title and status are indexed, and the rest — url, domain,
 * capturedAt, source, description — has to survive a write untouched.
 */
export function createLinkContent(params: {
  status: LinkFrontmatter["status"];
  title: string;
  url: string;
  description?: string | undefined;
  summary?: string | undefined;
  domain: string;
  capturedAt: string;
  source: LinkSource;
}): string {
  const frontmatter: LinkFrontmatter = {
    status: params.status,
    title: params.title,
    url: params.url,
    description: params.description,
    domain: params.domain,
    capturedAt: params.capturedAt,
    source: params.source,
  };
  return generateMarkdownWithFrontmatter(params.summary ?? "", frontmatter);
}

export function parseLinkContent(content: string): {
  frontmatter: LinkFrontmatter;
  summary: string;
} {
  const parsed = parseMarkdown(content);
  return {
    frontmatter: linkFrontmatterSchema.parse(parsed.frontmatter),
    summary: parsed.content.trim(),
  };
}
