import type { Logger } from "@brains/utils/logger";
import type {
  StaticSiteBuilder,
  StaticSiteBuilderFactory,
} from "./static-site-builder";

export interface CreateStaticSiteBuilderOptions {
  logger: Logger;
  outputDir: string;
  workingDir: string;
  cleanBeforeBuild: boolean;
  staticSiteBuilderFactory: StaticSiteBuilderFactory;
  signal: AbortSignal;
}

export async function createStaticSiteBuilder(
  options: CreateStaticSiteBuilderOptions,
): Promise<StaticSiteBuilder> {
  options.signal.throwIfAborted();
  const staticSiteBuilder = options.staticSiteBuilderFactory({
    logger: options.logger.child("StaticSiteBuilder"),
    workingDir: options.workingDir,
    outputDir: options.outputDir,
  });

  if (options.cleanBeforeBuild) {
    await staticSiteBuilder.clean();
  }
  options.signal.throwIfAborted();

  return staticSiteBuilder;
}
