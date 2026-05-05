import { ImageBuildService } from "@brains/site-engine";
import type { Logger } from "@brains/utils";
import { collectAllImageIds } from "./content-enrichment";
import type { SiteBuilderServices } from "./site-builder-services";

export interface PrepareSiteImagesOptions {
  services: SiteBuilderServices;
  logger: Logger;
  sharedImagesDir: string;
}

export async function prepareSiteImages(
  options: PrepareSiteImagesOptions,
): Promise<ImageBuildService> {
  const imageBuildService = new ImageBuildService(
    options.services.entityService,
    options.logger,
    options.sharedImagesDir,
  );

  const imageIds = await collectAllImageIds(
    options.services.entityService,
    options.logger,
  );

  if (imageIds.length > 0) {
    await imageBuildService.resolveAll(imageIds);
  }

  return imageBuildService;
}
