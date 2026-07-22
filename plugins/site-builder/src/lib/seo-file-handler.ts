import type { PreparedSiteBuild } from "@brains/site-engine";
import { generateRobotsTxt, generateSitemap } from "@brains/site-engine";
import type { Logger } from "@brains/utils/logger";
import { promises as fs } from "fs";
import { join } from "path";

export interface WriteSiteBuildSeoFilesOptions {
  outputDir: string;
  preparedBuild: PreparedSiteBuild;
  logger: Logger;
  siteUrl: string | undefined;
  signal: AbortSignal;
}

/** Write SEO artifacts into staging before manifest validation and publication. */
export async function writeSiteBuildSeoFiles(
  options: WriteSiteBuildSeoFilesOptions,
): Promise<void> {
  options.signal.throwIfAborted();
  const baseUrl =
    options.siteUrl ?? options.preparedBuild.site.url ?? "https://example.com";
  const robotsTxt = generateRobotsTxt(
    baseUrl,
    options.preparedBuild.environment,
  );
  await fs.writeFile(join(options.outputDir, "robots.txt"), robotsTxt, {
    encoding: "utf8",
    signal: options.signal,
  });
  options.signal.throwIfAborted();

  const sitemap = generateSitemap(options.preparedBuild.routes, baseUrl);
  await fs.writeFile(join(options.outputDir, "sitemap.xml"), sitemap, {
    encoding: "utf8",
    signal: options.signal,
  });
  options.signal.throwIfAborted();
  options.logger.info(
    `Generated staged SEO files with ${options.preparedBuild.routes.length} URLs`,
  );
}
