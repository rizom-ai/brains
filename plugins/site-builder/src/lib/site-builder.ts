import type {
  ProgressCallback,
  ServicePluginContext,
  IAnchorProfileService,
  ResolutionOptions,
} from "@brains/plugins";
import { baseEntitySchema } from "@brains/plugins";
import { resolveEntityCoverImage, extractCoverImageId } from "@brains/image";
import type { Logger } from "@brains/utils";
import { ProgressReporter } from "@brains/utils";
import type { SectionDefinition, RouteDefinition } from "@brains/plugins";
import type {
  ISiteBuilder,
  SiteBuilderOptions,
  BuildResult,
} from "../types/site-builder-types";
import { SiteBuilderOptionsSchema } from "../types/site-builder-types";
import type {
  StaticSiteBuilderFactory,
  BuildContext,
} from "./static-site-builder";
import { createPreactBuilder } from "./preact-builder";
import { join } from "path";
import type { RouteRegistry } from "./route-registry";
import { DynamicRouteGenerator } from "./dynamic-route-generator";

import type { EntityDisplayMap } from "../config";
import { buildSiteInfo } from "./build-site-info";
import type { SiteInfo } from "../types/site-info";
import { z, pluralize, EntityUrlGenerator } from "@brains/utils";
import { ImageBuildService } from "./image-build-service";

// Schema for entities with slug metadata (for auto-enrichment)
const entityWithSlugSchema = baseEntitySchema.extend({
  metadata: z
    .object({
      slug: z.string(),
    })
    .passthrough(), // Allow other metadata fields
});

// Type for enriched entity with url, typeLabel, listUrl, and listLabel
export type EnrichedEntity = z.infer<typeof entityWithSlugSchema> & {
  url: string;
  typeLabel: string;
  listUrl: string;
  listLabel: string;
  coverImageUrl?: string;
  coverImageWidth?: number;
  coverImageHeight?: number;
  coverImageSrcset?: string;
  coverImageSizes?: string;
};

export class SiteBuilder implements ISiteBuilder {
  private static instance: SiteBuilder | null = null;
  private static defaultStaticSiteBuilderFactory: StaticSiteBuilderFactory =
    createPreactBuilder;
  private logger: Logger;
  private context: ServicePluginContext;
  private staticSiteBuilderFactory: StaticSiteBuilderFactory;
  private routeRegistry: RouteRegistry;
  private profileService: IAnchorProfileService;
  private entityDisplay: EntityDisplayMap | undefined;
  private imageBuildService: ImageBuildService | null = null;

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
    context: ServicePluginContext,
    routeRegistry: RouteRegistry,
    profileService: IAnchorProfileService,
    entityDisplay?: EntityDisplayMap,
  ): SiteBuilder {
    SiteBuilder.instance ??= new SiteBuilder(
      logger,
      SiteBuilder.defaultStaticSiteBuilderFactory,
      context,
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
    context: ServicePluginContext,
    routeRegistry: RouteRegistry,
    profileService: IAnchorProfileService,
    staticSiteBuilderFactory?: StaticSiteBuilderFactory,
    entityDisplay?: EntityDisplayMap,
  ): SiteBuilder {
    return new SiteBuilder(
      logger,
      staticSiteBuilderFactory ?? SiteBuilder.defaultStaticSiteBuilderFactory,
      context,
      routeRegistry,
      profileService,
      entityDisplay,
    );
  }

  private constructor(
    logger: Logger,
    staticSiteBuilderFactory: StaticSiteBuilderFactory,
    context: ServicePluginContext,
    routeRegistry: RouteRegistry,
    profileService: IAnchorProfileService,
    entityDisplay?: EntityDisplayMap,
  ) {
    this.logger = logger;
    this.context = context;
    this.staticSiteBuilderFactory = staticSiteBuilderFactory;
    this.routeRegistry = routeRegistry;
    this.profileService = profileService;
    this.entityDisplay = entityDisplay;

    // Configure the shared EntityUrlGenerator singleton
    EntityUrlGenerator.getInstance().configure(entityDisplay);
  }

  private async getSiteInfo(): Promise<SiteInfo> {
    return buildSiteInfo(
      this.context.entityService,
      this.profileService,
      this.routeRegistry,
    );
  }

  async build(
    options: SiteBuilderOptions,
    progress?: ProgressCallback,
  ): Promise<BuildResult> {
    // Parse options through schema to apply defaults
    const parsedOptions = SiteBuilderOptionsSchema.parse(options);

    const reporter = ProgressReporter.from(progress);
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      await reporter?.report({
        message: "Starting site build",
        progress: 0,
        total: 100,
      });

      // Generate dynamic routes from entities before building
      await reporter?.report({
        message: "Generating dynamic routes",
        progress: 10,
        total: 100,
      });

      const dynamicRouteGenerator = new DynamicRouteGenerator(
        this.context,
        this.routeRegistry,
        this.entityDisplay,
      );
      await dynamicRouteGenerator.generateEntityRoutes();

      // Create static site builder instance
      const workingDir =
        parsedOptions.workingDir ??
        join(parsedOptions.outputDir, ".preact-work");
      const staticSiteBuilder = this.staticSiteBuilderFactory({
        logger: this.logger.child("StaticSiteBuilder"),
        workingDir,
        outputDir: parsedOptions.outputDir,
      });

      // Clean stale build artifacts (preserves images/ for sharp cache)
      if (parsedOptions.cleanBeforeBuild) {
        await staticSiteBuilder.clean();
      }

      // Get all registered routes (now includes dynamically generated ones)
      const routes = this.routeRegistry.list();
      if (routes.length === 0) {
        warnings.push("No routes registered for site build");
      }

      await reporter?.report({
        message: `Building ${routes.length} routes`,
        progress: 20,
        total: 100,
      });

      // Pre-resolve all images before rendering (Astro-like approach)
      await reporter?.report({
        message: "Resolving images",
        progress: 25,
        total: 100,
      });
      this.imageBuildService = new ImageBuildService(
        this.context.entityService,
        this.logger,
        parsedOptions.sharedImagesDir,
      );
      const imageIds = await this.collectAllImageIds();
      if (imageIds.length > 0) {
        await this.imageBuildService.resolveAll(imageIds);
      }

      // Create build context
      const siteConfig = parsedOptions.siteConfig;

      const buildContext: BuildContext = {
        routes,
        pluginContext: this.context,
        siteConfig: {
          title: siteConfig.title,
          description: siteConfig.description,
          ...(siteConfig.url && { url: siteConfig.url }),
          ...(siteConfig.copyright && { copyright: siteConfig.copyright }),
          ...(siteConfig.themeMode && { themeMode: siteConfig.themeMode }),
          ...(siteConfig.analyticsScript && {
            analyticsScript: siteConfig.analyticsScript,
          }),
        },
        headScripts: options.headScripts,
        ...(options.staticAssets && { staticAssets: options.staticAssets }),
        getContent: async (
          route: RouteDefinition,
          section: SectionDefinition,
        ) => {
          // In production, filter to only published content
          // In preview (or unspecified), show all content including drafts
          const publishedOnly = parsedOptions.environment === "production";
          return this.getContentForSection(section, route, publishedOnly);
        },
        getViewTemplate: (name: string) => {
          return this.context.views.get(name);
        },
        layouts: parsedOptions.layouts,
        getSiteInfo: async () => {
          return this.getSiteInfo();
        },
        ...(parsedOptions.themeCSS !== undefined && {
          themeCSS: parsedOptions.themeCSS,
        }),
        ...(options.slots && { slots: options.slots }),
        imageBuildService: this.imageBuildService,
      };

      // Run static site build (85% to 95% of overall progress)
      let buildStep = 0;
      const totalBuildSteps = routes.length + 4; // routes + start + tailwind + assets + hydration
      await staticSiteBuilder.build(buildContext, (message) => {
        buildStep++;
        // Map build steps to 85-95% range
        const stepProgress =
          85 + Math.round((buildStep / totalBuildSteps) * 10);
        // Report progress without await to avoid blocking
        reporter
          ?.report({ message, progress: stepProgress, total: 100 })
          .catch(() => {
            // Ignore progress reporting errors
          });
      });

      await reporter?.report({
        message: "Site build complete",
        progress: 100,
        total: 100,
      });

      // Count files generated (at minimum, one HTML file per route)
      const filesGenerated = routes.length + 1; // routes + CSS file

      const result: BuildResult = {
        success: errors.length === 0,
        outputDir: parsedOptions.outputDir,
        filesGenerated,
        routesBuilt: routes.length,
      };

      if (errors.length > 0) {
        result.errors = errors;
      }

      if (warnings.length > 0) {
        result.warnings = warnings;
      }

      return result;
    } catch (error) {
      const buildError = new Error("Site build process failed");
      this.logger.error("Site build failed", {
        error: buildError,
        originalError: error,
      });

      errors.push(buildError.message);
      return {
        success: false,
        outputDir: parsedOptions.outputDir,
        filesGenerated: 0,
        routesBuilt: 0,
        errors,
      };
    }
  }

  /**
   * Get content for a section, either from provided content or from entity
   */
  private async getContentForSection(
    section: SectionDefinition,
    route: { id: string },
    publishedOnly: boolean,
  ): Promise<unknown> {
    // If no template, only static content is possible
    if (!section.template) {
      return section.content ?? null;
    }

    const templateName = section.template;
    const urlGenerator = EntityUrlGenerator.getInstance();

    // Check if this section uses dynamic content (DataSource)
    if (section.dataQuery) {
      // Use the context's resolveContent helper with DataSource params
      // DataSource will handle any necessary transformations internally
      const options: ResolutionOptions = {
        // Parameters for DataSource fetch
        dataParams: section.dataQuery,
        // Static fallback content from section definition
        fallback: section.content,
        // Filter to published-only content in production builds
        publishedOnly,
      };

      const content = await this.context.templates.resolve(
        templateName,
        options,
      );

      // Auto-enrich data with URLs, typeLabels, and coverImageUrls
      if (content) {
        return this.enrichWithUrls(content, urlGenerator);
      }

      return null;
    }

    // Use the context's resolveContent helper for static content
    const content = await this.context.templates.resolve(templateName, {
      // Saved content from entity storage
      savedContent: {
        entityType: "site-content",
        entityId: `${route.id}:${section.id}`,
      },
      // Static fallback content from section definition
      fallback: section.content,
    });

    // Auto-enrich data with URLs, typeLabels, and coverImageUrls
    if (content) {
      return this.enrichWithUrls(content, urlGenerator);
    }

    return null;
  }

  /**
   * Auto-enrich data with URL, typeLabel, and coverImageUrl fields
   * Recursively traverses data and adds url/typeLabel/coverImageUrl to any entity objects
   */
  private async enrichWithUrls(
    data: unknown,
    urlGenerator: EntityUrlGenerator,
  ): Promise<unknown> {
    if (data === null || data === undefined) {
      return data;
    }

    if (Array.isArray(data)) {
      return Promise.all(
        data.map((item) => this.enrichWithUrls(item, urlGenerator)),
      );
    }

    if (typeof data !== "object") {
      return data;
    }

    const obj = data as Record<string, unknown>;

    // Recursively enrich all nested objects first (in parallel)
    const enriched: Record<string, unknown> = {};
    const entries = Object.entries(obj);
    const enrichedValues = await Promise.all(
      entries.map(([, value]) => this.enrichWithUrls(value, urlGenerator)),
    );
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry) {
        enriched[entry[0]] = enrichedValues[i];
      }
    }

    // Check if this object is an entity with slug metadata
    const entityCheck = entityWithSlugSchema.safeParse(obj);
    if (!entityCheck.success) {
      return enriched;
    }

    const entity = entityCheck.data;
    const entityType = entity.entityType;
    const slug = entity.metadata.slug;

    const config = this.entityDisplay?.[entityType];

    const typeLabel = config
      ? config.label
      : entityType.charAt(0).toUpperCase() + entityType.slice(1);

    // Compute listUrl and listLabel (plural) for breadcrumbs
    const pluralName = config
      ? (config.pluralName ?? config.label.toLowerCase() + "s")
      : pluralize(entityType);
    const listUrl = `/${pluralName}`;
    const listLabel = pluralName.charAt(0).toUpperCase() + pluralName.slice(1);

    // Resolve cover image: prefer pre-optimized from ImageBuildService, fall back to data URL
    const coverImageId = extractCoverImageId(entity);
    const preResolved = coverImageId
      ? this.imageBuildService?.get(coverImageId)
      : undefined;

    let coverImageFields: Partial<EnrichedEntity> = {};
    if (preResolved) {
      coverImageFields = {
        coverImageUrl: preResolved.src,
        coverImageWidth: preResolved.width,
        coverImageHeight: preResolved.height,
        ...(preResolved.srcset && {
          coverImageSrcset: preResolved.srcset,
          coverImageSizes: preResolved.sizes,
        }),
      };
    } else {
      // Fallback: resolve directly (returns data URL — post-processing will extract)
      const coverImage = await resolveEntityCoverImage(
        entity,
        this.context.entityService,
      );
      if (coverImage) {
        coverImageFields = {
          coverImageUrl: coverImage.url,
          coverImageWidth: coverImage.width,
          coverImageHeight: coverImage.height,
        };
      }
    }

    const enrichedEntity: EnrichedEntity = {
      ...enriched,
      ...entity,
      url: urlGenerator.generateUrl(entityType, slug),
      typeLabel,
      listUrl,
      listLabel,
      ...coverImageFields,
    };

    return enrichedEntity;
  }

  /**
   * Scan all entities for coverImageId references to pre-resolve before rendering.
   */
  private async collectAllImageIds(): Promise<string[]> {
    const imageIds = new Set<string>();

    try {
      // Get all entity types that have been registered
      const entityTypes = this.context.entityService.getEntityTypes();

      for (const entityType of entityTypes) {
        if (entityType === "image") continue; // Skip image entities themselves

        const entities =
          await this.context.entityService.listEntities(entityType);

        for (const entity of entities) {
          const coverImageId = extractCoverImageId(entity);
          if (coverImageId) {
            imageIds.add(coverImageId);
          }
        }
      }
    } catch (error) {
      this.logger.warn("Failed to collect image IDs for pre-resolution", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return [...imageIds];
  }
}
