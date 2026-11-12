import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { blogConfigSchema } from "./config";
import { blogDataSource } from "./datasources/blog-datasource";
import { rssDataSource } from "./datasources/rss-datasource";
import { post } from "./post";

/**
 * The blog: one entity, a post, rendered by the blog templates through the
 * blog's data source and syndicated in its feed and RSS data source, with
 * the package's settings as the blog plugin class took them.
 */
export const blogPackage: EntityPackageDefinition<
  readonly [typeof post],
  readonly [],
  typeof blogConfigSchema
> = defineEntityPackage({
  id: "blog",
  config: blogConfigSchema,
  entities: [post],
  dataSources: [blogDataSource(post), rssDataSource(post)],
});

export default blogPackage;

export { post } from "./post";
export {
  blogConfigSchema,
  type BlogConfig,
  type BlogConfigInput,
} from "./config";
export {
  blogPostSchema,
  blogPostMetadataSchema,
  blogPostWithDataSchema,
  enrichedBlogPostSchema,
  blogPostFrontmatterSchema,
  type BlogPost,
  type BlogPostMetadata,
  type BlogPostWithData,
  type EnrichedBlogPost,
  type BlogPostFrontmatter,
} from "./schemas/blog-post";
export {
  postDocument,
  postWithData as parsePostData,
} from "./lib/post-markdown";
export { buildBlogAtprotoPostRecord, postAtproto } from "./atproto-projection";
export { postFeed, postFeedItem } from "./feed";
export { postGeneration, blogGenerationJobSchema } from "./generation";
export {
  BlogListTemplate,
  blogPostToContentItem,
  type BlogListProps,
} from "./templates/blog-list";
export { BlogPostTemplate, type BlogPostProps } from "./templates/blog-post";
export {
  blogViewSchema,
  type BlogPostView,
  type BlogSchemaData,
} from "./templates/blog-view-schema";
