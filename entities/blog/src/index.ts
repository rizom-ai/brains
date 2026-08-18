/**
 * Blog package.
 *
 * One entity: a published post. No configuration, so this is an entity
 * package rather than a service one.
 */

import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/plugins";
import { post } from "./post-entity";

const blogPackage: EntityPackageDefinition<
  readonly [typeof post],
  readonly []
> = defineEntityPackage({ id: "blog", entities: [post] });

export default blogPackage;

export { post } from "./post-entity";
export { postGeneration } from "./handlers/blogGenerationJobHandler";
export { postToFeedItem } from "./lib/feed";

export {
  blogPostSchema,
  blogPostWithDataSchema,
  enrichedBlogPostSchema,
  blogPostFrontmatterSchema,
  type BlogPost,
  type BlogPostWithData,
  type EnrichedBlogPost,
  type BlogPostFrontmatter,
} from "./schemas/blog-post";
export { blogPostAdapter, BlogPostAdapter } from "./adapters/blog-post-adapter";
export { parsePostData } from "./datasources/parse-helpers";
export {
  buildBlogAtprotoPostRecord,
  createBlogAtprotoProjection,
} from "./atproto-projection";
export { BlogListTemplate, type BlogListProps } from "./templates/blog-list";
export { BlogPostTemplate, type BlogPostProps } from "./templates/blog-post";
export {
  blogViewSchema,
  type BlogPostView,
  type BlogSchemaData,
} from "./templates/blog-view-schema";
