import type { Logger } from "@brains/utils";
import { promises as fs } from "fs";
import { join } from "path";
import type { SiteBuildCompletedPayload } from "../types/job-types";
import type { RouteRegistry } from "@brains/site-engine";
import { generateRobotsTxt, generateSitemap } from "@brains/site-engine";

interface SeoMessage<TPayload = unknown> {
  payload: TPayload;
}

interface SeoMessagingContext {
  messaging: {
    subscribe<TPayload = unknown, TResult = unknown>(
      type: string,
      handler: (message: SeoMessage<TPayload>) => Promise<TResult> | TResult,
    ): () => void;
  };
}

interface SeoHandlerDeps {
  context: SeoMessagingContext;
  routeRegistry: RouteRegistry;
  logger: Logger;
}

/**
 * Generate robots.txt and sitemap.xml into the build output directory.
 */
async function generateSeoFiles(
  payload: SiteBuildCompletedPayload,
  routeRegistry: RouteRegistry,
  logger: Logger,
): Promise<void> {
  const baseUrl = payload.siteConfig.url ?? "https://example.com";
  const routes = routeRegistry.list();

  const robotsTxt = generateRobotsTxt(baseUrl, payload.environment);
  await fs.writeFile(join(payload.outputDir, "robots.txt"), robotsTxt, "utf-8");
  logger.info(`Generated robots.txt for ${payload.environment} environment`);

  const sitemap = generateSitemap(routes, baseUrl);
  await fs.writeFile(join(payload.outputDir, "sitemap.xml"), sitemap, "utf-8");
  logger.info(`Generated sitemap.xml with ${routes.length} URLs`);
}

/**
 * Subscribe to the site:build:completed event and generate SEO files
 * into the build output directory.
 */
export function subscribeBuildCompleted(deps: SeoHandlerDeps): void {
  const { context, routeRegistry, logger } = deps;

  context.messaging.subscribe<SiteBuildCompletedPayload, { success: boolean }>(
    "site:build:completed",
    async (message) => {
      try {
        const payload = message.payload;
        logger.info(
          `Received site:build:completed event for ${payload.environment} environment - generating SEO files`,
        );

        await generateSeoFiles(payload, routeRegistry, logger);

        return { success: true };
      } catch (error) {
        logger.error("Failed to generate SEO files", error);
        return { success: false };
      }
    },
  );
}
