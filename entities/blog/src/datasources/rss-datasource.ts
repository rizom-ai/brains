import { feedItemSchema, renderRssFeed } from "@brains/site-composition";
import {
  defineDataSource,
  type DataSourceDefinition,
  type EntityDefinition,
} from "@brains/sdk/entities";
import { z } from "@brains/utils/zod";
import type { blogPostMetadataSchema } from "../schemas/blog-post";
import { postFeedItem } from "../feed";

type PostDefinition = EntityDefinition<"post", typeof blogPostMetadataSchema>;

/** RSS feed query schema */
const rssFeedQuerySchema = z.object({
  siteUrl: z.url(),
  title: z.string(),
  description: z.string(),
  language: z.string().optional(),
  copyright: z.string().optional(),
});

/**
 * The RSS 2.0 document of the published posts, for the channel the query
 * names, as the blog plugin class's RSS data source wrote it: each post
 * under /posts/<slug>, the self link the site URL and /feed.xml.
 */
export function rssDataSource(post: PostDefinition): DataSourceDefinition {
  return defineDataSource({
    id: "rss",
    name: "Blog RSS Feed DataSource",
    description: "Generates RSS 2.0 feed XML from published blog posts",
    fetch: async (query, entities) => {
      const params = rssFeedQuerySchema.parse(query);
      const posts = await entities.list(post, {
        limit: 1000,
        sort: [{ field: "publishedAt", direction: "desc" }],
      });
      const items = posts.flatMap((entry) => {
        const item = postFeedItem(entry, { environment: "production" });
        return item ? [feedItemSchema.parse(item)] : [];
      });
      const siteRoot = params.siteUrl.replace(/\/+$/u, "");
      return {
        xml: renderRssFeed(
          items,
          {
            title: params.title,
            description: params.description,
            link: params.siteUrl,
            selfLink: `${params.siteUrl}/feed.xml`,
            language: params.language ?? "en-us",
            copyright: params.copyright,
          },
          (item) => `${siteRoot}/posts/${item.slug}`,
        ),
      };
    },
  });
}
