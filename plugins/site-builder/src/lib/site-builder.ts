import type { Logger } from "@brains/utils/logger";
import type { ProgressCallback } from "@brains/utils/progress";
import type {
  ISiteBuilder,
  SiteBuilderOptions,
  BuildResult,
} from "../types/site-builder-types";
import type { StaticSiteBuilderFactory } from "./static-site-builder";
import { createPreactBuilder } from "./preact-builder";
import type { RouteRegistry } from "@brains/site-engine";

import type { EntityDisplayMap } from "../config";
import { EntityUrlGenerator } from "@brains/site-composition";
import type { SiteBuilderServices } from "./site-builder-services";
import type { BuildPipelineContext } from "./build-pipeline-context";
import { runSiteBuild } from "./run-site-build";
import type { SiteBuildProfileService } from "./site-build-profile-service";
import type { SiteBuildOutputLifecycle } from "./site-build-output-lifecycle";
export type { EnrichedEntity } from "./content-enrichment";
export type { SiteBuilderServices } from "./site-builder-services";

interface ActiveSiteBuild {
  controller: AbortController;
  promise: Promise<BuildResult>;
}

export class SiteBuilder implements ISiteBuilder {
  private static instance: SiteBuilder | null = null;
  private static defaultStaticSiteBuilderFactory: StaticSiteBuilderFactory =
    createPreactBuilder;
  private pipelineContext: BuildPipelineContext;
  private staticSiteBuilderFactory: StaticSiteBuilderFactory;
  private outputLifecycle: SiteBuildOutputLifecycle | undefined;
  private readonly activeBuilds = new Map<string, ActiveSiteBuild>();

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
    entityDisplay: EntityDisplayMap | undefined = undefined,
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
    entityDisplay: EntityDisplayMap | undefined = undefined,
    outputLifecycle?: SiteBuildOutputLifecycle,
  ): SiteBuilder {
    return new SiteBuilder(
      logger,
      staticSiteBuilderFactory ?? SiteBuilder.defaultStaticSiteBuilderFactory,
      services,
      routeRegistry,
      profileService,
      entityDisplay,
      outputLifecycle,
    );
  }

  private constructor(
    logger: Logger,
    staticSiteBuilderFactory: StaticSiteBuilderFactory,
    services: SiteBuilderServices,
    routeRegistry: RouteRegistry,
    profileService: SiteBuildProfileService,
    entityDisplay: EntityDisplayMap | undefined,
    outputLifecycle?: SiteBuildOutputLifecycle,
  ) {
    this.pipelineContext = {
      logger,
      services,
      routeRegistry,
      profileService,
      entityDisplay,
    };
    this.staticSiteBuilderFactory = staticSiteBuilderFactory;
    this.outputLifecycle = outputLifecycle;

    // Configure the shared EntityUrlGenerator singleton
    EntityUrlGenerator.getInstance().configure(entityDisplay);
  }

  async build(
    options: SiteBuilderOptions,
    progress?: ProgressCallback,
  ): Promise<BuildResult> {
    const environment = options.environment;
    const previousBuild = this.activeBuilds.get(environment);
    previousBuild?.controller.abort(
      new Error(`Superseded by a newer ${environment} site build`),
    );

    const controller = new AbortController();
    const signal = options.signal
      ? AbortSignal.any([controller.signal, options.signal])
      : controller.signal;
    const promise = runSiteBuild({
      buildOptions: options,
      progress,
      pipelineContext: this.pipelineContext,
      staticSiteBuilderFactory: this.staticSiteBuilderFactory,
      ...(this.outputLifecycle && { outputLifecycle: this.outputLifecycle }),
      signal,
    });
    const activeBuild = { controller, promise };
    this.activeBuilds.set(environment, activeBuild);

    try {
      return await promise;
    } finally {
      if (this.activeBuilds.get(environment) === activeBuild) {
        this.activeBuilds.delete(environment);
      }
    }
  }

  /** Cancel admitted builds and wait for staging cleanup to settle. */
  async cancelActiveBuilds(
    reason: Error = new Error("Site builder is shutting down"),
  ): Promise<void> {
    const activeBuilds = [...this.activeBuilds.values()];
    for (const build of activeBuilds) build.controller.abort(reason);
    await Promise.allSettled(activeBuilds.map((build) => build.promise));
  }
}
