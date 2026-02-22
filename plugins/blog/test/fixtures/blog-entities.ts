import type {
  BlogPost,
  BlogPostWithData,
  BlogPostMetadata,
  BlogPostFrontmatter,
  BlogPostStatus,
} from "../../src/schemas/blog-post";
import type { Series } from "../../src/schemas/series";
import { createTestEntity } from "@brains/test-utils";

/**
 * Default blog post metadata for tests
 */
export const defaultBlogMetadata: BlogPostMetadata = {
  title: "Test Post",
  slug: "test-post",
  status: "draft",
};

/**
 * Default blog post frontmatter for tests
 */
export const defaultBlogFrontmatter: BlogPostFrontmatter = {
  title: "Test Post",
  slug: "test-post",
  status: "draft",
  excerpt: "Test excerpt",
  author: "Test Author",
};

/**
 * Create a mock BlogPost entity with computed contentHash.
 */
export function createMockBlogPost(
  overrides: Partial<Omit<BlogPost, "contentHash">> & { content: string },
): BlogPost {
  return createTestEntity<BlogPost>("post", {
    id: overrides.id ?? "test-post",
    content: overrides.content,
    ...(overrides.created && { created: overrides.created }),
    ...(overrides.updated && { updated: overrides.updated }),
    metadata: overrides.metadata ?? defaultBlogMetadata,
  });
}

/**
 * Create a mock BlogPostWithData entity with computed contentHash.
 */
export function createMockBlogPostWithData(
  overrides: Partial<Omit<BlogPostWithData, "contentHash">> & {
    content: string;
    body: string;
  },
): BlogPostWithData {
  return createTestEntity<BlogPostWithData>("post", {
    id: overrides.id ?? "test-post",
    content: overrides.content,
    ...(overrides.created && { created: overrides.created }),
    ...(overrides.updated && { updated: overrides.updated }),
    metadata: overrides.metadata ?? defaultBlogMetadata,
    frontmatter: overrides.frontmatter ?? defaultBlogFrontmatter,
    body: overrides.body,
  });
}

/**
 * Build frontmatter content string from parameters.
 * Used by createMockPost and createMockPostWithData to generate consistent markdown.
 */
function buildPostContent(
  title: string,
  slug: string,
  status: BlogPostStatus,
  opts: {
    publishedAt?: string;
    seriesName?: string;
    seriesIndex?: number;
    excerpt?: string;
    author?: string;
  } = {},
): string {
  const {
    publishedAt,
    seriesName,
    seriesIndex,
    excerpt = `Excerpt for ${title}`,
    author = "Test Author",
  } = opts;

  const lines = [
    "---",
    `title: ${title}`,
    `slug: ${slug}`,
    `status: ${status}`,
  ];
  if (publishedAt) lines.push(`publishedAt: "${publishedAt}"`);
  lines.push(`excerpt: ${excerpt}`);
  lines.push(`author: ${author}`);
  if (seriesName) lines.push(`seriesName: ${seriesName}`);
  if (seriesIndex !== undefined) lines.push(`seriesIndex: ${seriesIndex}`);
  lines.push("---", "", `# ${title}`, "", `Content for ${title}`);

  return lines.join("\n");
}

/**
 * Create a mock BlogPost from simple parameters.
 * Generates consistent frontmatter content automatically.
 */
export function createMockPost(
  id: string,
  title: string,
  slug: string,
  status: BlogPostStatus = "published",
  opts: {
    publishedAt?: string;
    seriesName?: string;
    seriesIndex?: number;
  } = {},
): BlogPost {
  const content = buildPostContent(title, slug, status, opts);
  return createTestEntity<BlogPost>("post", {
    id,
    content,
    metadata: {
      title,
      slug,
      status,
      publishedAt: opts.publishedAt,
      seriesName: opts.seriesName,
      seriesIndex: opts.seriesIndex,
    },
  });
}

/**
 * Create a mock Series entity from a title.
 * Generates slug from title and builds frontmatter content.
 */
export function createMockSeries(title: string, slug?: string): Series {
  const seriesSlug = slug ?? title.toLowerCase().replace(/\s+/g, "-");
  const content = `---\ntitle: ${title}\nslug: ${seriesSlug}\n---\n\n# ${title}`;
  return createTestEntity<Series>("series", {
    id: seriesSlug,
    content,
    metadata: { title, slug: seriesSlug },
  });
}
