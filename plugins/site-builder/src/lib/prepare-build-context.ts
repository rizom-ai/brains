import type { RouteDefinition } from "@brains/site-composition";

import type { SiteBuilderOptions } from "../types/site-builder-types";
import type { BuildContext } from "./static-site-builder";
import type { BuildPipelineContext } from "./build-pipeline-context";
import { createBuildContext } from "./create-build-context";
import { prepareSiteImages } from "./prepare-site-images";
import { resolveSiteMetadata } from "./site-metadata";

export interface PrepareBuildContextOptions {
  routes: RouteDefinition[];
  parsedOptions: Pick<
    SiteBuilderOptions,
    "environment" | "siteConfig" | "layouts" | "themeCSS" | "sharedImagesDir"
  >;
  buildOptions: Pick<
    SiteBuilderOptions,
    "headScripts" | "staticAssets" | "slots"
  >;
  pipelineContext: BuildPipelineContext;
}

export async function prepareBuildContext(
  options: PrepareBuildContextOptions,
): Promise<BuildContext> {
  const imageBuildService = await prepareSiteImages({
    pipelineContext: options.pipelineContext,
    sharedImagesDir: options.parsedOptions.sharedImagesDir,
  });

  const siteMetadata = await resolveSiteMetadata(
    options.pipelineContext.services.sendMessage,
    options.parsedOptions.siteConfig,
  );

  return createBuildContext({
    routes: options.routes,
    parsedOptions: options.parsedOptions,
    buildOptions: options.buildOptions,
    pipelineContext: options.pipelineContext,
    imageBuildService,
    siteMetadata,
  });
}
