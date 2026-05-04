import type { Logger, ProgressCallback } from "@brains/utils";
import type {
  ISiteBuilder,
  SiteBuilderOptions,
  BuildResult,
} from "../types/site-builder-types";
import type { StaticSiteBuilderFactory } from "./static-site-builder";
import { createPreactBuilder } from "./preact-builder";
import type { RouteRegistry } from "@brains/site-engine";

import type { EntityDisplayMap } from "../config";
import { EntityUrlGenerator } from "@brains/utils";
import type { SiteBuilderServices } from "./site-builder-services";
import { runSiteBuild } from "./run-site-build";
import type { SiteBuildProfileService } from "./site-build-profile-service";
export type { EnrichedEntity } from "./content-enrichment";
export type { SiteBuilderServices } from "./site-builder-services";

export class SiteBuilder implements ISiteBuilder {
  private static instance: SiteBuilder | null = null;
  private static defaultStaticSiteBuilderFactory: StaticSiteBuilderFactory =
    createPreactBuilder;
  private logger: Logger;
  private services: SiteBuilderServices;
  private staticSiteBuilderFactory: StaticSiteBuilderFactory;
  private routeRegistry: RouteRegistry;
  private profileService: SiteBuildProfileService;
  private entityDisplay: EntityDisplayMap | undefined;

  /**
   * Set the default static site builder factory for all instances
   */
  public static setDefaultStaticSiteBuilderFactory(
    factory: StaticSiteBuilderFactory,
  ): void {
    SiteBuilder.defaultStaticSiteBuilderFactory = factory;
  }

  public static getInstance(
    logger: Logger,
    services: SiteBuilderServices,
    routeRegistry: RouteRegistry,
    profileService: SiteBuildProfileService,
    entityDisplay?: EntityDisplayMap,
  ): SiteBuilder {
    SiteBuilder.instance ??= new SiteBuilder(
      logger,
      SiteBuilder.defaultStaticSiteBuilderFactory,
      services,
      routeRegistry,
      profileService,
      entityDisplay,
    );
    return SiteBuilder.instance;
  }

  public static resetInstance(): void {
    SiteBuilder.instance = null;
  }

  public static createFresh(
    logger: Logger,
    services: SiteBuilderServices,
    routeRegistry: RouteRegistry,
    profileService: SiteBuildProfileService,
    staticSiteBuilderFactory?: StaticSiteBuilderFactory,
    entityDisplay?: EntityDisplayMap,
  ): SiteBuilder {
    return new SiteBuilder(
      logger,
      staticSiteBuilderFactory ?? SiteBuilder.defaultStaticSiteBuilderFactory,
      services,
      routeRegistry,
      profileService,
      entityDisplay,
    );
  }

  private constructor(
    logger: Logger,
    staticSiteBuilderFactory: StaticSiteBuilderFactory,
    services: SiteBuilderServices,
    routeRegistry: RouteRegistry,
    profileService: SiteBuildProfileService,
    entityDisplay?: EntityDisplayMap,
  ) {
    this.logger = logger;
    this.services = services;
    this.staticSiteBuilderFactory = staticSiteBuilderFactory;
    this.routeRegistry = routeRegistry;
    this.profileService = profileService;
    this.entityDisplay = entityDisplay;

    // Configure the shared EntityUrlGenerator singleton
    EntityUrlGenerator.getInstance().configure(entityDisplay);
  }

  async build(
    options: SiteBuilderOptions,
    progress?: ProgressCallback,
  ): Promise<BuildResult> {
    return runSiteBuild({
      buildOptions: options,
      progress,
      logger: this.logger,
      services: this.services,
      routeRegistry: this.routeRegistry,
      profileService: this.profileService,
      staticSiteBuilderFactory: this.staticSiteBuilderFactory,
      entityDisplay: this.entityDisplay,
    });
  }
}
