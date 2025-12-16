import type { ProgressCallback, Logger } from "@brains/plugins";
import { ProgressReporter } from "@brains/plugins";
import type { ServicePluginContext, Template } from "@brains/plugins";
import type { ResolutionOptions } from "@brains/content-service";
import type { SectionDefinition, RouteDefinition } from "../types/routes";
import type {
  ISiteBuilder,
  SiteBuilderOptions,
  BuildResult,
} from "../types/site-builder-types";
import { SiteBuilderOptionsSchema } from "../types/site-builder-types";
import { builtInTemplates } from "../view-template-schemas";
import type {
  StaticSiteBuilderFactory,
  BuildContext,
} from "./static-site-builder";
import { createPreactBuilder } from "./preact-builder";
import { join } from "path";
import type { RouteRegistry } from "./route-registry";
import { DynamicRouteGenerator } from "./dynamic-route-generator";
import type { SiteInfo } from "../types/site-info";
import type { SiteInfoService } from "../services/site-info-service";
import type { ProfileService } from "@brains/profile-service";
import type { EntityRouteConfig } from "../config";
import { baseEntitySchema } from "@brains/entity-service";
import { z, pluralize, EntityUrlGenerator } from "@brains/utils";

// Schema for entities with slug metadata (for auto-enrichment)
const entityWithSlugSchema = baseEntitySchema.extend({
  metadata: z
    .object({
      slug: z.string(),
    })
    .passthrough(), // Allow other metadata fields
});

// Type for enriched entity with url and typeLabel
type EnrichedEntity = z.infer<typeof entityWithSlugSchema> & {
  url: string;
  typeLabel: string;
};

export class SiteBuilder implements ISiteBuilder {
  private static instance: SiteBuilder | null = null;
  private static defaultStaticSiteBuilderFactory: StaticSiteBuilderFactory =
    createPreactBuilder;
  private logger: Logger;
  private context: ServicePluginContext;
  private staticSiteBuilderFactory: StaticSiteBuilderFactory;
  private routeRegistry: RouteRegistry;
  private siteInfoService: SiteInfoService;
  private profileService: ProfileService;
  private entityRouteConfig: EntityRouteConfig | undefined;

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
    siteInfoService: SiteInfoService,
    profileService: ProfileService,
    entityRouteConfig?: EntityRouteConfig,
  ): SiteBuilder {
    SiteBuilder.instance ??= new SiteBuilder(
      logger,
      SiteBuilder.defaultStaticSiteBuilderFactory,
      context,
      routeRegistry,
      siteInfoService,
      profileService,
      entityRouteConfig,
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
    siteInfoService: SiteInfoService,
    profileService: ProfileService,
    staticSiteBuilderFactory?: StaticSiteBuilderFactory,
    entityRouteConfig?: EntityRouteConfig,
  ): SiteBuilder {
    return new SiteBuilder(
      logger,
      staticSiteBuilderFactory ?? SiteBuilder.defaultStaticSiteBuilderFactory,
      context,
      routeRegistry,
      siteInfoService,
      profileService,
      entityRouteConfig,
    );
  }

  private constructor(
    logger: Logger,
    staticSiteBuilderFactory: StaticSiteBuilderFactory,
    context: ServicePluginContext,
    routeRegistry: RouteRegistry,
    siteInfoService: SiteInfoService,
    profileService: ProfileService,
    entityRouteConfig?: EntityRouteConfig,
  ) {
    this.logger = logger;
    this.context = context;
    this.staticSiteBuilderFactory = staticSiteBuilderFactory;
    this.routeRegistry = routeRegistry;
    this.siteInfoService = siteInfoService;
    this.profileService = profileService;
    this.entityRouteConfig = entityRouteConfig;

    // Configure the shared EntityUrlGenerator singleton
    EntityUrlGenerator.getInstance().configure(entityRouteConfig);

    // Register built-in templates
    this.registerBuiltInTemplates();
  }

  /**
   * Build site information directly from available data
   */
  private async getSiteInfo(): Promise<SiteInfo> {
    // Get site info from service (entity or defaults)
    const siteInfoBody = await this.siteInfoService.getSiteInfo();

    // Get profile info from service (for socialLinks)
    const profileBody = this.profileService.getProfile();

    // Get navigation items for both slots
    const primaryItems = this.routeRegistry.getNavigationItems("primary");
    const secondaryItems = this.routeRegistry.getNavigationItems("secondary");

    // Generate default copyright if not provided
    const currentYear = new Date().getFullYear();
    const defaultCopyright = `© ${currentYear} ${siteInfoBody.title}. All rights reserved.`;

    // Build complete site info (merge site-info, profile.socialLinks, and navigation)
    return {
      ...siteInfoBody,
      // socialLinks now comes from profile entity only
      socialLinks: profileBody.socialLinks,
      navigation: {
        primary: primaryItems,
        secondary: secondaryItems,
      },
      copyright: siteInfoBody.copyright ?? defaultCopyright,
    };
  }

  private registerBuiltInTemplates(): void {
    // Convert array to object for registerTemplates
    const templatesObj = builtInTemplates.reduce(
      (acc, template) => {
        acc[template.name] = template;
        return acc;
      },
      {} as Record<string, Template>,
    );

    // Register built-in templates
    this.context.registerTemplates(templatesObj);
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
        this.entityRouteConfig,
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
        },
        getContent: async (
          route: RouteDefinition,
          section: SectionDefinition,
        ) => {
          return this.getContentForSection(
            section,
            route,
            parsedOptions.environment,
          );
        },
        getViewTemplate: (name: string) => {
          return this.context.getViewTemplate(name);
        },
        layouts: parsedOptions.layouts,
        getSiteInfo: async () => {
          return this.getSiteInfo();
        },
        ...(parsedOptions.themeCSS !== undefined && {
          themeCSS: parsedOptions.themeCSS,
        }),
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
    environment?: string,
  ): Promise<unknown> {
    // If no template, only static content is possible
    if (!section.template) {
      return section.content ?? null;
    }

    // Template name will be automatically scoped by the context helper
    const templateName = section.template;

    // Create URL generator function based on entityRouteConfig
    const generateEntityUrl = (entityType: string, slug: string): string => {
      const config = this.entityRouteConfig?.[entityType];

      if (config) {
        // Use custom config
        const pluralName =
          config.pluralName ?? config.label.toLowerCase() + "s";
        return `/${pluralName}/${slug}`;
      }

      // Fall back to auto-generated pluralization
      const pluralName = pluralize(entityType);
      return `/${pluralName}/${slug}`;
    };

    // Check if this section uses dynamic content (DataSource)
    if (section.dataQuery) {
      // Use the context's resolveContent helper with DataSource params
      // DataSource will handle any necessary transformations internally
      const options: ResolutionOptions = {
        // Parameters for DataSource fetch
        dataParams: section.dataQuery,
        // Static fallback content from section definition
        fallback: section.content,
        // Pass URL generator for datasources to add url fields
        generateEntityUrl,
        // Pass environment if defined
        ...(environment !== undefined && { environment }),
      };

      const content = await this.context.resolveContent(templateName, options);

      // Auto-enrich data with URLs and typeLabels
      if (content) {
        return this.enrichWithUrls(content, generateEntityUrl);
      }

      return null;
    }

    // Use the context's resolveContent helper for static content
    const content = await this.context.resolveContent(templateName, {
      // Saved content from entity storage
      savedContent: {
        entityType: "site-content",
        entityId: `${route.id}:${section.id}`,
      },
      // Static fallback content from section definition
      fallback: section.content,
      // Pass URL generator for datasources
      generateEntityUrl,
    });

    // Auto-enrich data with URLs and typeLabels
    if (content) {
      return this.enrichWithUrls(content, generateEntityUrl);
    }

    return null;
  }

  /**
   * Auto-enrich data with URL and typeLabel fields
   * Recursively traverses data and adds url/typeLabel to any entity objects
   */
  private enrichWithUrls(
    data: unknown,
    generateEntityUrl: (entityType: string, slug: string) => string,
  ): unknown {
    // Handle null/undefined
    if (data === null || data === undefined) {
      return data;
    }

    // Handle arrays - recursively enrich each item
    if (Array.isArray(data)) {
      return data.map((item) => this.enrichWithUrls(item, generateEntityUrl));
    }

    // Handle objects
    if (typeof data === "object") {
      const obj = data as Record<string, unknown>;

      // Recursively enrich all nested objects first
      const enriched: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        enriched[key] = this.enrichWithUrls(value, generateEntityUrl);
      }

      // Check if this object is an entity with slug metadata
      const entityCheck = entityWithSlugSchema.safeParse(obj);
      if (entityCheck.success) {
        const entity = entityCheck.data;
        const entityType = entity.entityType;
        const slug = entity.metadata.slug;

        // Build properly typed enriched entity
        const config = this.entityRouteConfig?.[entityType];
        const enrichedEntity: EnrichedEntity = {
          ...enriched,
          ...entity,
          url: generateEntityUrl(entityType, slug),
          typeLabel: config
            ? config.label
            : entityType.charAt(0).toUpperCase() + entityType.slice(1),
        };

        return enrichedEntity;
      }

      return enriched;
    }

    // Return primitives as-is
    return data;
  }
}
