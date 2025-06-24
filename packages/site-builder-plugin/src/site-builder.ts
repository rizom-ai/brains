import type { ProgressCallback, Logger } from "@brains/utils";
import { ProgressReporter, parseMarkdownWithFrontmatter } from "@brains/utils";
import type {
  SiteBuilder as ISiteBuilder,
  SiteBuilderOptions,
  BuildResult,
  PluginContext,
  SectionDefinition,
  BaseEntity,
} from "@brains/types";
import { builtInTemplates } from "./view-template-schemas";
import type {
  StaticSiteBuilderFactory,
  BuildContext,
} from "./static-site-builder";
import { createPreactBuilder } from "./preact-builder";
import { join } from "path";
import { z } from "zod";

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

    // Register factory in context registry
    context.registry.register(
      "staticSiteBuilderFactory",
      () => this.staticSiteBuilderFactory,
    );

    // Register built-in templates
    this.registerBuiltInTemplates();
  }

  private registerBuiltInTemplates(): void {
    for (const template of builtInTemplates) {
      this.context.viewRegistry.registerViewTemplate(template);
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
      const routes = this.context.viewRegistry.listRoutes();
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
        viewRegistry: this.context.viewRegistry,
        siteConfig: {
          title: siteConfig.title,
          description: siteConfig.description,
          ...(siteConfig.url && { url: siteConfig.url }),
        },
        getContent: async (section: SectionDefinition) => {
          return this.getContentForSection(section);
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
      errors.push(
        `Site build failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
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
  ): Promise<unknown> {
    // If content is provided directly, use it
    if (section.content) {
      return section.content;
    }

    // If contentEntity is specified, fetch from entity service
    if (section.contentEntity) {
      const entities = await this.context.entityService.listEntities(
        section.contentEntity.entityType,
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
          entity.entityType === "site-content" &&
          typeof entity.content === "string"
        ) {
          try {
            // Parse the markdown with frontmatter
            const { content: markdownBody } = parseMarkdownWithFrontmatter(
              entity.content,
              z.object({}).passthrough(),
            );

            // Get the formatter for this template using section.template
            if (section.template) {
              // Templates are registered with site-builder prefix
              const templateName = section.template.includes(":")
                ? section.template
                : `site-builder:${section.template}`;

              const formatter =
                this.context.contentRegistry.getFormatter(templateName);

              if (formatter) {
                // Use the formatter to parse markdown back to structured data
                return formatter.parse(markdownBody);
              } else {
                this.logger.warn(
                  `No formatter found for template: ${templateName}`,
                );
              }
            } else {
              this.logger.warn(
                `No template specified for section ${section.id}`,
              );
            }

            // If no formatter found, return the markdown body
            return markdownBody;
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
