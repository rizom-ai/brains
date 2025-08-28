import type { ProgressCallback, Logger } from "@brains/plugins";
import { ProgressReporter } from "@brains/plugins";
import type { ServicePluginContext, Template } from "@brains/plugins";
import type { SectionDefinition, RouteDefinition } from "../types/routes";
import type {
  ISiteBuilder,
  SiteBuilderOptions,
  BuildResult,
} from "../types/site-builder-types";
import { builtInTemplates } from "../view-template-schemas";
import type {
  StaticSiteBuilderFactory,
  BuildContext,
} from "./static-site-builder";
import { createPreactBuilder } from "./preact-builder";
import { join } from "path";
import type { RouteRegistry } from "./route-registry";

export class SiteBuilder implements ISiteBuilder {
  private static instance: SiteBuilder | null = null;
  private static defaultStaticSiteBuilderFactory: StaticSiteBuilderFactory =
    createPreactBuilder;
  private logger: Logger;
  private context: ServicePluginContext;
  private staticSiteBuilderFactory: StaticSiteBuilderFactory;
  private routeRegistry: RouteRegistry;

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
  ): SiteBuilder {
    SiteBuilder.instance ??= new SiteBuilder(
      logger,
      SiteBuilder.defaultStaticSiteBuilderFactory,
      context,
      routeRegistry,
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
    staticSiteBuilderFactory?: StaticSiteBuilderFactory,
  ): SiteBuilder {
    return new SiteBuilder(
      logger,
      staticSiteBuilderFactory ?? SiteBuilder.defaultStaticSiteBuilderFactory,
      context,
      routeRegistry,
    );
  }

  private constructor(
    logger: Logger,
    staticSiteBuilderFactory: StaticSiteBuilderFactory,
    context: ServicePluginContext,
    routeRegistry: RouteRegistry,
  ) {
    this.logger = logger;
    this.context = context;
    this.staticSiteBuilderFactory = staticSiteBuilderFactory;
    this.routeRegistry = routeRegistry;

    // Factory is now encapsulated within the site builder

    // Register built-in templates
    this.registerBuiltInTemplates();
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
      const siteConfig = options.siteConfig;

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

      // Count files generated (at minimum, one HTML file per route)
      const filesGenerated = routes.length + 1; // routes + CSS file

      const result: BuildResult = {
        success: errors.length === 0,
        outputDir: options.outputDir,
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
    } catch {
      const buildError = new Error("Site build process failed");
      this.logger.error("Site build failed", { error: buildError });

      errors.push(buildError.message);
      return {
        success: false,
        outputDir: options.outputDir,
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
    environment: "preview" | "production" = "preview",
  ): Promise<unknown> {
    // If no template, only static content is possible
    if (!section.template) {
      return section.content ?? null;
    }

    // Template name will be automatically scoped by the context helper
    const templateName = section.template;

    // Use the context's resolveContent helper
    const content = await this.context.resolveContent(templateName, {
      // Saved content from entity storage
      savedContent: {
        entityType:
          environment === "production"
            ? "site-content-production"
            : "site-content-preview",
        entityId: `${route.id}:${section.id}`,
      },
      // Static fallback content from section definition
      fallback: section.content,
    });

    return content ?? null;
  }
}
