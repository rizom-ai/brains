import { join } from "path";
import type { Logger } from "@brains/utils";
import type { SiteBuilderOptions } from "../types/site-builder-types";
import type {
  StaticSiteBuilder,
  StaticSiteBuilderFactory,
} from "./static-site-builder";

export interface CreateStaticSiteBuilderOptions {
  logger: Logger;
  parsedOptions: Pick<
    SiteBuilderOptions,
    "workingDir" | "outputDir" | "cleanBeforeBuild"
  >;
  staticSiteBuilderFactory: StaticSiteBuilderFactory;
}

export async function createStaticSiteBuilder(
  options: CreateStaticSiteBuilderOptions,
): Promise<StaticSiteBuilder> {
  const workingDir =
    options.parsedOptions.workingDir ??
    join(options.parsedOptions.outputDir, ".preact-work");

  const staticSiteBuilder = options.staticSiteBuilderFactory({
    logger: options.logger.child("StaticSiteBuilder"),
    workingDir,
    outputDir: options.parsedOptions.outputDir,
  });

  if (options.parsedOptions.cleanBeforeBuild) {
    await staticSiteBuilder.clean();
  }

  return staticSiteBuilder;
}
