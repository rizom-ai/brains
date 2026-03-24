import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { BlogPost } from "../schemas/blog-post";
import {
  blogPostFrontmatterSchema,
  blogPostWithDataSchema,
  type BlogPostWithData,
} from "../schemas/blog-post";

export function parsePostData(entity: BlogPost): BlogPostWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    blogPostFrontmatterSchema,
  );
  return blogPostWithDataSchema.parse({
    ...entity,
    frontmatter: parsed.metadata,
    body: parsed.content,
  });
}
