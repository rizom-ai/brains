import { ImageBuildService } from "@brains/site-engine";
import { collectAllImageIds } from "./content-enrichment";
import type { BuildPipelineContext } from "./build-pipeline-context";

export interface PrepareSiteImagesOptions {
  pipelineContext: BuildPipelineContext;
  sharedImagesDir: string;
  signal: AbortSignal;
}

export async function prepareSiteImages(
  options: PrepareSiteImagesOptions,
): Promise<ImageBuildService> {
  options.signal.throwIfAborted();
  const imageBuildService = new ImageBuildService(
    options.pipelineContext.services.entityService,
    options.pipelineContext.logger,
    options.sharedImagesDir,
  );

  const imageIds = await collectAllImageIds(
    options.pipelineContext.services.entityService,
    options.pipelineContext.logger,
  );
  options.signal.throwIfAborted();

  if (imageIds.length > 0) {
    await imageBuildService.resolveAll(imageIds, options.signal);
  }
  options.signal.throwIfAborted();

  return imageBuildService;
}
