import { createTestEntity } from "@brains/entity-service/test";
import type {
  BlogPost,
  BlogPostWithData,
  BlogPostMetadata,
  BlogPostFrontmatter,
  BlogPostStatus,
} from "../../src/schemas/blog-post";

/**
 * Default blog post metadata for tests
 */
export const defaultBlogMetadata: BlogPostMetadata = {
  title: "Test Post",
  slug: "test-post",
  authoredSlug: true,
  status: "draft",
  excerpt: "Test excerpt",
  author: "Test Author",
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
    excerpt?: string;
    author?: string;
  } = {},
): string {
  const {
    publishedAt,
    seriesName,
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
  if (seriesName) lines.push(`series: [${seriesName}]`);
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
    /** The one series the post is in, written as its group value. */
    seriesName?: string;
  } = {},
): BlogPost {
  const content = buildPostContent(title, slug, status, opts);
  return createTestEntity<BlogPost>("post", {
    id,
    content,
    // A store row: the stored document, its frontmatter decoded beside it.
    metadata: {
      title,
      slug,
      authoredSlug: true,
      status,
      excerpt: `Excerpt for ${title}`,
      author: "Test Author",
      ...(opts.publishedAt !== undefined && { publishedAt: opts.publishedAt }),
      ...(opts.seriesName !== undefined && { series: [opts.seriesName] }),
    },
  });
}
