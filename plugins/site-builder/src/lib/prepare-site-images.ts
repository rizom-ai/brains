import { ImageBuildService } from "@brains/site-engine";
import { collectAllImageIds } from "./content-enrichment";
import type { BuildPipelineContext } from "./build-pipeline-context";

export interface PrepareSiteImagesOptions {
  pipelineContext: BuildPipelineContext;
  sharedImagesDir: string;
}

export async function prepareSiteImages(
  options: PrepareSiteImagesOptions,
): Promise<ImageBuildService> {
  const imageBuildService = new ImageBuildService(
    options.pipelineContext.services.entityService,
    options.pipelineContext.logger,
    options.sharedImagesDir,
  );

  const imageIds = await collectAllImageIds(
    options.pipelineContext.services.entityService,
    options.pipelineContext.logger,
  );

  if (imageIds.length > 0) {
    await imageBuildService.resolveAll(imageIds);
  }

  return imageBuildService;
}
