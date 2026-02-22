import type { ServicePluginContext } from "@brains/plugins";
import { blogPostSchema } from "../schemas/blog-post";
import { blogPostAdapter } from "../adapters/blog-post-adapter";
import { seriesSchema } from "../schemas/series";
import { seriesAdapter } from "../adapters/series-adapter";

export function registerEntities(context: ServicePluginContext): void {
  context.entities.register("post", blogPostSchema, blogPostAdapter, {
    weight: 2.0,
  });
  context.entities.register("series", seriesSchema, seriesAdapter);
}
