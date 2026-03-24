import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { BlogDataSource } from "../datasources/blog-datasource";

export async function registerDataSources(
  context: ServicePluginContext,
  logger: Logger,
): Promise<void> {
  const blogDataSource = new BlogDataSource(logger.child("BlogDataSource"));
  context.entities.registerDataSource(blogDataSource);

  const { RSSDataSource } = await import("../datasources/rss-datasource");
  const rssDataSource = new RSSDataSource(logger.child("RSSDataSource"));
  context.entities.registerDataSource(rssDataSource);
}
