import type { ProgressCallback, Logger } from "@brains/utils";
import { ProgressReporter } from "@brains/utils";
import type { PluginContext, BaseEntity } from "@brains/types";
import type {
  SiteBuilder as ISiteBuilder,
  SiteBuilderOptions,
  BuildResult,
  SectionDefinition,
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
      await reporter?.report("Starting site build", 0, 100);

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

      await reporter?.report(`Building ${routes.length} routes`, 20, 100);

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
        getContent: async (section: SectionDefinition) => {
          return this.getContentForSection(section, options.environment);
        },
        getViewTemplate: (name: string) => {
          return this.context.getViewTemplate(name);
        },
      };

      // Run static site build
      await reporter?.report("Running static site build", 85, 100);
      await staticSiteBuilder.build(buildContext, (message) => {
        void reporter?.report(message);
      });

      await reporter?.report("Site build complete", 100, 100);

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
    environment: "preview" | "production" = "preview",
  ): Promise<unknown> {
    // If content is provided directly, use it
    if (section.content) {
      return section.content;
    }

    // If contentEntity is specified, fetch from entity service
    if (section.contentEntity) {
      // Map entity type based on environment
      let entityType = section.contentEntity.entityType;
      if (
        environment === "production" &&
        entityType === "site-content-preview"
      ) {
        entityType = "site-content-production";
      }

      const entities = await this.context.entityService.listEntities(
        entityType,
        section.contentEntity.query
          ? { filter: { metadata: section.contentEntity.query } }
          : undefined,
      );

      if (entities.length > 0) {
        const entity = entities[0] as BaseEntity;

        // TODO: Future refactoring - create a StructuredContentEntityAdapter that
        // handles both formatting and parsing in one place. This would:
        // - Take entity type as a parameter (not hardcoded to site-content)
        // - Return already-parsed structured data from entityService
        // - Sunset the need for SiteContentAdapter
        // - Eliminate the need for manual parsing here

        // For now, we need to parse site-content entities manually
        if (
          (entity.entityType === "site-content-preview" ||
            entity.entityType === "site-content-production") &&
          typeof entity.content === "string"
        ) {
          try {
            // Use ContentGenerator to parse existing content if template is available
            if (section.template) {
              try {
                // Templates are registered with site-builder prefix
                const templateName = section.template.includes(":")
                  ? section.template
                  : `site-builder:${section.template}`;

                // Use ContentGenerator to parse the existing content to structured data
                const parsedContent = this.context.parseContent(
                  templateName,
                  entity.content,
                );

                return parsedContent;
              } catch (error) {
                this.logger.warn(
                  `Failed to parse content with template ${section.template}: ${error}`,
                );
                // Fallback to raw content
                return entity.content;
              }
            } else {
              this.logger.warn(
                `No template specified for section ${section.id}`,
              );
              return entity.content;
            }
          } catch (error) {
            this.logger.warn(`Failed to parse site-content entity: ${error}`);
            return entity.content;
          }
        }

        // For other entities, return the content as-is
        return entity.content;
      }
    }

    return null;
  }
}
