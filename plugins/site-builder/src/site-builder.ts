import type { ProgressCallback, Logger } from "@brains/utils";
import { ProgressReporter } from "@brains/utils";
import type { PluginContext } from "@brains/plugin-utils";
import type {
  SiteBuilder as ISiteBuilder,
  SiteBuilderOptions,
  BuildResult,
  SectionDefinition,
  RouteDefinition,
} from "@brains/view-registry";
import { builtInTemplates } from "./view-template-schemas";
import type {
  StaticSiteBuilderFactory,
  BuildContext,
} from "./static-site-builder";
import { createPreactBuilder } from "./preact-builder";
import { SiteBuildError } from "./errors";
import { join } from "path";

export class SiteBuilder implements ISiteBuilder {
  private static instance: SiteBuilder | null = null;
  private static defaultStaticSiteBuilderFactory: StaticSiteBuilderFactory =
    createPreactBuilder;
  private logger: Logger;
  private context: PluginContext;
  private staticSiteBuilderFactory: StaticSiteBuilderFactory;

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
    context: PluginContext,
  ): SiteBuilder {
    SiteBuilder.instance ??= new SiteBuilder(
      logger,
      SiteBuilder.defaultStaticSiteBuilderFactory,
      context,
    );
    return SiteBuilder.instance;
  }

  public static resetInstance(): void {
    SiteBuilder.instance = null;
  }

  public static createFresh(
    logger: Logger,
    context: PluginContext,
    staticSiteBuilderFactory?: StaticSiteBuilderFactory,
  ): SiteBuilder {
    return new SiteBuilder(
      logger,
      staticSiteBuilderFactory ?? SiteBuilder.defaultStaticSiteBuilderFactory,
      context,
    );
  }

  private constructor(
    logger: Logger,
    staticSiteBuilderFactory: StaticSiteBuilderFactory,
    context: PluginContext,
  ) {
    this.logger = logger;
    this.context = context;
    this.staticSiteBuilderFactory = staticSiteBuilderFactory;

    // Factory is now encapsulated within the site builder

    // Register built-in templates
    this.registerBuiltInTemplates();
  }

  private registerBuiltInTemplates(): void {
    for (const template of builtInTemplates) {
      // Register built-in templates directly
      this.context.registerTemplate(template.name, template);
    }
  }

  async build(
    options: SiteBuilderOptions,
    progress?: ProgressCallback,
  ): Promise<BuildResult> {
    const reporter = ProgressReporter.from(progress);
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      await reporter?.report({
        message: "Starting site build",
        progress: 0,
        total: 100,
      });

      // Create static site builder instance
      const workingDir =
        options.workingDir ?? join(options.outputDir, ".preact-work");
      const staticSiteBuilder = this.staticSiteBuilderFactory({
        logger: this.logger.child("StaticSiteBuilder"),
        workingDir,
        outputDir: options.outputDir,
      });

      // Get all registered routes
      const routes = this.context.listRoutes();
      if (routes.length === 0) {
        warnings.push("No routes registered for site build");
      }

      await reporter?.report({
        message: `Building ${routes.length} routes`,
        progress: 20,
        total: 100,
      });

      // Create build context
      const siteConfig = options.siteConfig ?? {
        title: "Personal Brain",
        description: "A knowledge management system",
      };

      const buildContext: BuildContext = {
        routes,
        pluginContext: this.context,
        siteConfig: {
          title: siteConfig.title,
          description: siteConfig.description,
          ...(siteConfig.url && { url: siteConfig.url }),
        },
        getContent: async (
          route: RouteDefinition,
          section: SectionDefinition,
        ) => {
          return this.getContentForSection(section, route, options.environment);
        },
        getViewTemplate: (name: string) => {
          return this.context.getViewTemplate(name);
        },
      };

      // Run static site build
      await reporter?.report({
        message: "Running static site build",
        progress: 85,
        total: 100,
      });
      await staticSiteBuilder.build(buildContext, (message) => {
        // Report progress without await to avoid blocking
        reporter?.report({ message, progress: 0 }).catch(() => {
          // Ignore progress reporting errors
        });
      });

      await reporter?.report({
        message: "Site build complete",
        progress: 100,
        total: 100,
      });

      const result: BuildResult = {
        success: errors.length === 0,
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
      const buildError = new SiteBuildError(
        "Site build process failed",
        error,
        { options },
      );
      this.logger.error("Site build failed", { error: buildError });

      errors.push(buildError.message);
      return {
        success: false,
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
    environment: "preview" | "production" = "preview",
  ): Promise<unknown> {
    // If content is provided directly, use it
    if (section.content) {
      return section.content;
    }

    // Look up entity by ID pattern (routeId:sectionId)
    const entityId = `${route.id}:${section.id}`;
    const entityType =
      environment === "production"
        ? "site-content-production"
        : "site-content-preview";

    try {
      const entity = await this.context.entityService.getEntity(
        entityType,
        entityId,
      );
      if (entity && section.template) {
        const templateName = section.template.includes(":")
          ? section.template
          : `site-builder:${section.template}`;
        this.logger.debug(`Found entity ${entityId}, parsing content`);
        return this.context.parseContent(templateName, entity.content);
      }
    } catch (error) {
      this.logger.debug(`No entity found with ID ${entityId}`, { error });
    }

    return null;
  }
}
