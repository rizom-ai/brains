import type {
  BlogPost,
  BlogPostWithData,
  BlogPostMetadata,
  BlogPostFrontmatter,
} from "../../src/schemas/blog-post";
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
 * Create a mock BlogPost entity with computed contentHash
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
 * Create a mock BlogPostWithData entity with computed contentHash
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
