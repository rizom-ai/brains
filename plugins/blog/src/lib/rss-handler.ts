import type { ServicePluginContext } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { SiteBuildCompletedPayload } from "@brains/site-builder-plugin";
import type { BlogPost } from "../schemas/blog-post";
import { blogPostFrontmatterSchema } from "../schemas/blog-post";
import type { BlogPostWithData } from "../datasources/blog-datasource";
import { generateRSSFeed } from "../rss/feed-generator";
import { promises as fs } from "fs";
import { join } from "path";

export function subscribeToSiteBuildCompleted(
  context: ServicePluginContext,
  logger: Logger,
): void {
  context.messaging.subscribe<SiteBuildCompletedPayload, { success: boolean }>(
    "site:build:completed",
    async (message) => {
      try {
        const payload = message.payload;

        logger.info(
          `Received site:build:completed event for ${payload.environment} environment`,
        );

        await generateRSSAfterBuild(context, logger, payload);
      } catch (error) {
        logger.error("Failed to generate RSS feed", error);
      }
      return { success: true };
    },
  );
}

async function generateRSSAfterBuild(
  context: ServicePluginContext,
  logger: Logger,
  payload: SiteBuildCompletedPayload,
): Promise<void> {
  const isPreview = payload.environment === "preview";
  logger.info(
    `Auto-generating RSS feed after site build (${isPreview ? "all posts" : "published only"})`,
  );

  const allPosts: BlogPost[] = await context.entityService.listEntities(
    "post",
    { limit: 1000 },
  );

  const filteredPosts: BlogPostWithData[] = allPosts
    .filter(
      (p) =>
        isPreview ||
        (p.metadata.status === "published" && p.metadata.publishedAt),
    )
    .map((entity) => {
      const parsed = parseMarkdownWithFrontmatter(
        entity.content,
        blogPostFrontmatterSchema,
      );
      return {
        ...entity,
        frontmatter: parsed.metadata,
        body: parsed.content,
        url: payload.generateEntityUrl("post", entity.metadata.slug),
      };
    });

  if (filteredPosts.length === 0) {
    logger.info(
      `No ${isPreview ? "" : "published "}posts found, skipping RSS generation`,
    );
    return;
  }

  const siteUrl = payload.siteConfig.url ?? "https://example.com";
  const siteTitle = payload.siteConfig.title ?? "Blog";
  const siteDescription = payload.siteConfig.description ?? "Latest blog posts";

  const xml = generateRSSFeed(filteredPosts, {
    title: siteTitle,
    description: siteDescription,
    link: siteUrl,
    language: "en-us",
    includeAllPosts: isPreview,
  });

  const feedPath = join(payload.outputDir, "feed.xml");
  await fs.writeFile(feedPath, xml, "utf-8");

  logger.info(
    `RSS feed generated successfully with ${filteredPosts.length} posts at ${feedPath}`,
  );
}
