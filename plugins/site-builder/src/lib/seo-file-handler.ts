import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { toYaml } from "@brains/utils";
import { promises as fs } from "fs";
import { join } from "path";
import type { SiteBuilderConfig } from "../config";
import type { SiteBuildCompletedPayload } from "../types/job-types";
import type { RouteRegistry } from "./route-registry";
import { generateRobotsTxt } from "./robots-generator";
import { generateSitemap } from "./sitemap-generator";
import { generateCmsConfig, CMS_ADMIN_HTML } from "./cms-config";

interface SeoHandlerDeps {
  context: ServicePluginContext;
  routeRegistry: RouteRegistry;
  config: SiteBuilderConfig;
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
 * Generate CMS admin page and config.yml if CMS is enabled and git-sync info
 * is available.
 */
async function generateCmsFiles(
  payload: SiteBuildCompletedPayload,
  context: ServicePluginContext,
  config: SiteBuilderConfig,
  logger: Logger,
): Promise<void> {
  if (!config.cms) return;

  const repoInfo = await context.messaging.send<
    Record<string, never>,
    { repo: string; branch: string }
  >("git-sync:get-repo-info", {});

  if ("noop" in repoInfo || !repoInfo.success || !repoInfo.data?.repo) {
    logger.warn(
      "CMS enabled but git-sync repo info unavailable — skipping CMS generation",
    );
    return;
  }

  const entityTypes = context.entityService.getEntityTypes();
  const cmsConfig = generateCmsConfig({
    repo: repoInfo.data.repo,
    branch: repoInfo.data.branch,
    ...(config.cms.baseUrl && { baseUrl: config.cms.baseUrl }),
    entityTypes,
    getFrontmatterSchema: (type) =>
      context.entities.getEffectiveFrontmatterSchema(type),
    getAdapter: (type) => context.entities.getAdapter(type),
    ...(config.entityRouteConfig && {
      entityRouteConfig: config.entityRouteConfig,
    }),
  });

  const adminDir = join(payload.outputDir, "admin");
  await fs.mkdir(adminDir, { recursive: true });
  await fs.writeFile(join(adminDir, "config.yml"), toYaml(cmsConfig), "utf-8");
  await fs.writeFile(join(adminDir, "index.html"), CMS_ADMIN_HTML, "utf-8");
  logger.info("Generated CMS admin page and config.yml");
}

/**
 * Subscribe to the site:build:completed event and generate SEO + CMS files
 * into the build output directory.
 */
export function subscribeBuildCompleted(deps: SeoHandlerDeps): void {
  const { context, routeRegistry, config, logger } = deps;

  context.messaging.subscribe<SiteBuildCompletedPayload, { success: boolean }>(
    "site:build:completed",
    async (message) => {
      try {
        const payload = message.payload;
        logger.info(
          `Received site:build:completed event for ${payload.environment} environment - generating SEO files`,
        );

        await generateSeoFiles(payload, routeRegistry, logger);
        await generateCmsFiles(payload, context, config, logger);

        return { success: true };
      } catch (error) {
        logger.error("Failed to generate SEO files", error);
        return { success: false };
      }
    },
  );
}
