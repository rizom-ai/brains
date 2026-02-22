import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { BlogGenerationJobHandler } from "../handlers/blogGenerationJobHandler";

export function registerJobHandler(
  context: ServicePluginContext,
  logger: Logger,
): void {
  const handler = new BlogGenerationJobHandler(
    logger.child("BlogGenerationJobHandler"),
    context,
  );
  context.jobs.registerHandler("generation", handler);
}
