import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";
import { SeriesManager } from "../services/series-manager";

export function subscribeToSeriesEvents(
  context: ServicePluginContext,
  logger: Logger,
): void {
  const seriesManager = new SeriesManager(
    context.entityService,
    logger.child("SeriesManager"),
  );

  for (const event of ["entity:created", "entity:updated"] as const) {
    context.messaging.subscribe<
      { entityType: string; entity: BlogPost },
      { success: boolean }
    >(event, async (message) => {
      if (message.payload.entityType === "post") {
        await seriesManager.handlePostChange(message.payload.entity);
      }
      return { success: true };
    });
  }

  context.messaging.subscribe<
    { entityType: string; entityId: string },
    { success: boolean }
  >("entity:deleted", async (message) => {
    if (message.payload.entityType === "post") {
      await seriesManager.syncSeriesFromPosts();
    }
    return { success: true };
  });

  context.messaging.subscribe("sync:initial:completed", async () => {
    logger.info("Initial sync completed, syncing series from posts");
    await seriesManager.syncSeriesFromPosts();
    return { success: true };
  });
}
