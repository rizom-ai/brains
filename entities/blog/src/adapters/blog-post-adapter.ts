import { generateMarkdownWithFrontmatter } from "@brains/sdk/entities";
import type { BlogPostFrontmatter } from "../schemas/blog-post";

/**
 * Builds the markdown a blog post is stored as.
 *
 * This used to be a full `BaseEntityAdapter`, back when the package
 * registered its own. The declarative entity builds its adapter from the
 * `markdown` codec on `post`, so the class's `toMarkdown`/`fromMarkdown`
 * stopped running once the package converted — the codec does that now.
 * What is left is the one thing callers still need: turning frontmatter
 * and a body into content.
 */
export class BlogPostAdapter {
  public createPostContent(
    frontmatter: BlogPostFrontmatter,
    body: string,
  ): string {
    return generateMarkdownWithFrontmatter(body, frontmatter);
  }
}

export const blogPostAdapter: BlogPostAdapter = new BlogPostAdapter();
