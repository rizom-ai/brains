import type { ProgressCallback, Logger } from "@brains/utils";
import { ProgressReporter } from "@brains/utils";
import type {
  SiteBuilder as ISiteBuilder,
  SiteBuilderOptions,
  BuildResult,
  RouteDefinition,
  ContentGenerationRequest,
  PluginContext,
} from "@brains/types";
import { builtInTemplates } from "./view-template-schemas";
import type {
  StaticSiteBuilder,
  StaticSiteBuilderFactory,
} from "./static-site-builder";
import { createAstroBuilder } from "./astro-builder";
import { join } from "path";
import { toYaml, parseMarkdownWithFrontmatter } from "@brains/utils";
import { z } from "zod";

export class SiteBuilder implements ISiteBuilder {
  private static instance: SiteBuilder | null = null;
  private static defaultStaticSiteBuilderFactory: StaticSiteBuilderFactory =
    createAstroBuilder;
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
      // Use provided workingDir or default to .astro-work inside outputDir
      const workingDir =
        options.workingDir ?? join(options.outputDir, ".astro-work");
      const staticSiteBuilder = this.staticSiteBuilderFactory({
        logger: this.logger.child("StaticSiteBuilder"),
        workingDir,
        outputDir: options.outputDir,
      });

      // Prepare working directory
      await reporter?.report("Preparing build environment", 5, 100);
      await staticSiteBuilder.prepare();

      // Generate content configuration
      await reporter?.report("Generating content configuration", 10, 100);
      const schemas = this.collectContentSchemas();
      await staticSiteBuilder.generateContentConfig(schemas);

      // Generate general context if enabled
      if (options.enableContentGeneration && options.siteConfig) {
        await reporter?.report("Generating general context", 15, 100);
        await this.generateGeneralContext({
          title: options.siteConfig.title,
          description: options.siteConfig.description,
          ...(options.siteConfig.url && { url: options.siteConfig.url }),
        });
      }

      // Get all registered routes
      const routes = this.context.viewRegistry.listRoutes();
      if (routes.length === 0) {
        warnings.push("No routes registered for site build");
      }

      await reporter?.report(`Building ${routes.length} routes`, 20, 100);

      // Build each route
      let routesBuilt = 0;
      for (let i = 0; i < routes.length; i++) {
        const route = routes[i];
        if (!route) {
          continue;
        }
        const routeProgress = 20 + (i / routes.length) * 60;

        await reporter?.report(
          `Building route: ${route.path}`,
          routeProgress,
          100,
        );

        try {
          await this.buildPage(route, options, staticSiteBuilder, reporter);
          routesBuilt++;
          this.logger.info(`Successfully built route: ${route.path}`);
        } catch (error) {
          errors.push(
            `Failed to build route ${route.path}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          this.logger.error(`Failed to build route ${route.path}:`, error);
        }
      }

      // Run static site build
      await reporter?.report("Running static site build", 85, 100);
      await staticSiteBuilder.build((message) => {
        void reporter?.report(message);
      });

      await reporter?.report("Site build complete", 100, 100);

      const result: BuildResult = {
        success: errors.length === 0,
        routesBuilt,
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

  private async buildPage(
    route: RouteDefinition,
    options: SiteBuilderOptions,
    staticSiteBuilder: StaticSiteBuilder,
    reporter?: ProgressReporter,
  ): Promise<void> {
    // Validate all sections have valid templates
    for (const section of route.sections) {
      const template = this.context.viewRegistry.getViewTemplate(
        section.template,
      );
      if (!template) {
        throw new Error(
          `Unknown template "${section.template}" in section "${section.id}"`,
        );
      }
    }

    // Process sections that need content generation
    if (options.enableContentGeneration) {
      await this.generatePageContent(route, reporter);
    }

    // Write route data as YAML for Astro
    const routeData = await this.assemblePageData(route);

    // Determine collection name based on route path
    let collection: string;
    let filename: string;

    if (route.path === "/") {
      collection = "landing";
      filename = "index.yaml";
    } else {
      collection = "routes";
      filename = `${route.path.slice(1)}.yaml`;
    }

    this.logger.info(
      `Writing ${collection}/${filename} with data:`,
      JSON.stringify(routeData, null, 2),
    );

    // Debug: Check the structure
    if (collection === "landing") {
      this.logger.info("Landing route structure check:");
      for (const [key, value] of Object.entries(
        routeData as Record<string, unknown>,
      )) {
        this.logger.info(`  ${key}: ${typeof value}`);
      }
    }

    await staticSiteBuilder.writeContentFile(collection, filename, routeData);
  }

  private async generatePageContent(
    route: RouteDefinition,
    reporter?: ProgressReporter,
  ): Promise<void> {
    const sectionsNeedingContent = route.sections.filter(
      (section) => section.contentEntity && !section.content,
    );

    if (sectionsNeedingContent.length === 0) {
      return;
    }

    await reporter?.report(
      `Generating content for ${sectionsNeedingContent.length} sections`,
    );

    for (const section of sectionsNeedingContent) {
      if (!section.contentEntity) continue;

      // TODO: Query for existing content entity
      // TODO: If not found, generate via ContentGenerationService
      // TODO: Store generated content as entity
      // For now, this is a placeholder

      const request: ContentGenerationRequest = {
        pageId: route.path,
        sectionId: section.id,
        template: section.contentEntity.template,
        context: {
          routeTitle: route.title,
          pluginId: route.pluginId,
        },
      };

      // Placeholder for actual content generation
      await reporter?.report(
        `Would generate content for section ${section.id} using template ${request.template}`,
      );
    }
  }

  /**
   * Collect content schemas from registered content types
   */
  private collectContentSchemas(): Map<string, z.ZodType<unknown>> {
    const schemas = new Map<string, z.ZodType<unknown>>();

    // Create landing collection schema by combining section schemas from templates
    const templates = this.context.viewRegistry.listViewTemplates();
    const landingSchemaObj: Record<string, z.ZodType<unknown>> = {
      title: z.string(),
      tagline: z.string(),
    };

    // Add each template's schema as a property
    for (const template of templates) {
      landingSchemaObj[template.name] = template.schema;
    }

    schemas.set("landing", z.object(landingSchemaObj));

    // Add generic routes schema
    schemas.set(
      "routes",
      z.object({
        title: z.string(),
        path: z.string(),
        description: z.string().optional(),
        sections: z.record(z.unknown()).optional(),
      }),
    );

    return schemas;
  }

  /**
   * Generate general context for the site
   */
  private async generateGeneralContext(siteConfig: {
    title: string;
    description: string;
    url?: string;
  }): Promise<void> {
    // Check if general context already exists
    const entityService = this.context.entityService;
    const existingContext = await entityService.listEntities("site-content", {
      filter: {
        metadata: {
          route: "general",
          section: "general",
          environment: "preview",
        },
      },
    });

    if (existingContext.length > 0) {
      return; // Already exists
    }

    // Generate general context
    const contentGenerationService = this.context.contentGenerationService;
    const generalContext = await contentGenerationService.generateContent(
      "general-context",
      {
        prompt: `Create organizational context for "${siteConfig.title}" - ${siteConfig.description}`,
        context: siteConfig,
      },
    );

    // Get formatter for general context
    const contentRegistry = this.context.contentRegistry;
    const formatter = contentRegistry.getFormatter(
      "default-site:general-context",
    );

    // Format content using the appropriate formatter
    const formattedContent = formatter
      ? formatter.format(generalContext)
      : toYaml(generalContext);

    // Save as entity - use generic object type since we don't have access to SiteContent type
    await entityService.createEntity({
      entityType: "site-content",
      content: formattedContent,
    }); // TODO: Fix this when site-content is moved to a shared location
  }

  /**
   * Assemble route data from sections
   */
  private async assemblePageData(route: RouteDefinition): Promise<unknown> {
    const sections: Record<string, unknown> = {};

    for (const section of route.sections) {
      if (section.content) {
        // Use static content
        sections[section.id] = section.content;
      } else if (section.contentEntity) {
        // Load content from entity
        const entityService = this.context.entityService;
        const entities = await entityService.listEntities(
          section.contentEntity.entityType,
          section.contentEntity.query
            ? {
                filter: { metadata: section.contentEntity.query },
              }
            : undefined,
        );

        if (entities.length > 0 && entities[0]) {
          // Parse content from entity using the formatter
          const contentRegistry = this.context.contentRegistry;

          // Template names need to be fully qualified with plugin prefix
          const templateName = section.contentEntity.template ?? "";
          const fullyQualifiedName = templateName.includes(":")
            ? templateName
            : `default-site:${templateName}`;

          const formatter = contentRegistry.getFormatter(fullyQualifiedName);

          if (formatter?.parse) {
            // Extract content part without frontmatter for structured formatters
            let contentToParse = entities[0].content;
            try {
              // Try to extract just the markdown content without frontmatter
              const { content: markdownContent } = parseMarkdownWithFrontmatter(
                entities[0].content,
                z.object({}), // Don't validate frontmatter, just extract content
              );
              contentToParse = markdownContent;
            } catch {
              // If parsing fails, use content as-is
              contentToParse = entities[0].content;
            }

            // Use formatter's parse method with clean content
            sections[section.id] = formatter.parse(contentToParse);
          } else {
            throw new Error(
              `No formatter with parse method found for template: ${fullyQualifiedName}`,
            );
          }
        } else {
          // No entity found - log this for debugging
          this.logger.warn(
            `No content entity found for section ${section.id} with query:`,
            section.contentEntity.query,
          );
        }
      }
    }

    // For landing route, flatten sections into expected structure
    if (route.path === "/") {
      return {
        title: route.title,
        tagline: route.description,
        ...sections,
      };
    }

    return {
      path: route.path,
      title: route.title,
      description: route.description,
      sections,
    };
  }
}
