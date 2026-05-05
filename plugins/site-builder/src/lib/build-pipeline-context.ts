import type { RouteRegistry } from "@brains/site-engine";
import type { Logger } from "@brains/utils";
import type { EntityDisplayMap } from "../config";
import type { SiteBuilderServices } from "./site-builder-services";
import type { SiteBuildProfileService } from "./site-build-profile-service";

export interface BuildPipelineContext {
  logger: Logger;
  services: SiteBuilderServices;
  routeRegistry: RouteRegistry;
  profileService: SiteBuildProfileService;
  entityDisplay: EntityDisplayMap | undefined;
}
