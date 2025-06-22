import type { ProgressCallback, Logger } from "@brains/utils";
import { ProgressReporter } from "@brains/utils";
import type {
  SiteBuilder as ISiteBuilder,
  SiteBuilderOptions,
  BuildResult,
  PageDefinition,
  ContentGenerationRequest,
  PluginContext,
} from "@brains/types";
import { PageRegistry } from "./page-registry";
import { LayoutRegistry } from "./layout-registry";
import { builtInLayouts } from "./layout-schemas";
import type {
  StaticSiteBuilder,
  StaticSiteBuilderFactory,
} from "./static-site-builder";
import { createAstroBuilder } from "./astro-builder";
import { join } from "path";
import { toYaml, fromYaml } from "@brains/utils";

export class SiteBuilder implements ISiteBuilder {
  private static instance: SiteBuilder | null = null;
  private static defaultStaticSiteBuilderFactory: StaticSiteBuilderFactory =
    createAstroBuilder;
  private pageRegistry: PageRegistry;
  private layoutRegistry: LayoutRegistry;
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
      PageRegistry.getInstance(),
      LayoutRegistry.getInstance(),
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
      PageRegistry.createFresh(),
      LayoutRegistry.createFresh(),
      logger,
      staticSiteBuilderFactory ?? SiteBuilder.defaultStaticSiteBuilderFactory,
      context,
    );
  }

  private constructor(
    pageRegistry: PageRegistry,
    layoutRegistry: LayoutRegistry,
    logger: Logger,
    staticSiteBuilderFactory: StaticSiteBuilderFactory,
    context: PluginContext,
  ) {
    this.pageRegistry = pageRegistry;
    this.layoutRegistry = layoutRegistry;
    this.logger = logger;
    this.context = context;
    this.staticSiteBuilderFactory = staticSiteBuilderFactory;

    // Register factory in context registry
    context.registry.register(
      "staticSiteBuilderFactory",
      () => this.staticSiteBuilderFactory,
    );

    // Register built-in layouts
    this.registerBuiltInLayouts();
  }

  private registerBuiltInLayouts(): void {
    for (const layout of builtInLayouts) {
      this.layoutRegistry.register(layout);
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

      // Get all registered pages
      const pages = this.pageRegistry.list();
      if (pages.length === 0) {
        warnings.push("No pages registered for site build");
      }

      await reporter?.report(`Building ${pages.length} pages`, 20, 100);

      // Build each page
      let pagesBuilt = 0;
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        if (!page) {
          continue;
        }
        const pageProgress = 20 + (i / pages.length) * 60;

        await reporter?.report(
          `Building page: ${page.path}`,
          pageProgress,
          100,
        );

        try {
          await this.buildPage(page, options, staticSiteBuilder, reporter);
          pagesBuilt++;
        } catch (error) {
          errors.push(
            `Failed to build page ${page.path}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
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
        pagesBuilt,
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
        pagesBuilt: 0,
        errors,
      };
    }
  }

  private async buildPage(
    page: PageDefinition,
    options: SiteBuilderOptions,
    staticSiteBuilder: StaticSiteBuilder,
    reporter?: ProgressReporter,
  ): Promise<void> {
    // Validate all sections have valid layouts
    for (const section of page.sections) {
      const layout = this.layoutRegistry.get(section.layout);
      if (!layout) {
        throw new Error(
          `Unknown layout "${section.layout}" in section "${section.id}"`,
        );
      }
    }

    // Process sections that need content generation
    if (options.enableContentGeneration) {
      await this.generatePageContent(page, reporter);
    }

    // Write page data as YAML for Astro
    const pageData = await this.assemblePageData(page);
    
    // Determine collection name based on page path
    let collection: string;
    let filename: string;
    
    if (page.path === "/") {
      collection = "landing";
      filename = "index.yaml";
    } else {
      collection = "pages";
      filename = `${page.path.slice(1)}.yaml`;
    }
    
    await staticSiteBuilder.writeContentFile(collection, filename, pageData);
  }

  private async generatePageContent(
    page: PageDefinition,
    reporter?: ProgressReporter,
  ): Promise<void> {
    const sectionsNeedingContent = page.sections.filter(
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
        pageId: page.path,
        sectionId: section.id,
        template: section.contentEntity.template,
        context: {
          pageTitle: page.title,
          pluginId: page.pluginId,
        },
      };

      // Placeholder for actual content generation
      await reporter?.report(
        `Would generate content for section ${section.id} using template ${request.template}`,
      );
    }
  }

  public getPageRegistry(): PageRegistry {
    return this.pageRegistry;
  }

  public getLayoutRegistry(): LayoutRegistry {
    return this.layoutRegistry;
  }

  /**
   * Collect content schemas from registered content types
   */
  private collectContentSchemas(): Map<string, unknown> {
    const schemas = new Map<string, unknown>();

    // Add page schema
    schemas.set("pages", {
      title: "string",
      path: "string",
      sections: "array",
    });

    // Add schemas from content type registry
    const contentTypes = this.context.contentTypeRegistry.list();
    for (const contentType of contentTypes) {
      const schema = this.context.contentTypeRegistry.get(contentType);
      if (schema) {
        schemas.set(contentType, schema);
      }
    }

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
          page: "general",
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
    const contentTypeRegistry = this.context.contentTypeRegistry;
    const formatter = contentTypeRegistry.getFormatter("general-context");

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
   * Assemble page data from sections
   */
  private async assemblePageData(page: PageDefinition): Promise<unknown> {
    const sections: Record<string, unknown> = {};

    for (const section of page.sections) {
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
          const contentTypeRegistry = this.context.contentTypeRegistry;
          const formatter = contentTypeRegistry.getFormatter(
            section.contentEntity.template ?? "",
          );

          if (formatter?.parse) {
            // Use formatter's parse method if available
            sections[section.id] = formatter.parse(entities[0].content);
          } else {
            // Fallback - try to parse as YAML
            try {
              sections[section.id] = fromYaml(entities[0].content);
            } catch {
              // If not valid YAML, use as-is
              sections[section.id] = entities[0].content;
            }
          }
        }
      }
    }

    return {
      path: page.path,
      title: page.title,
      description: page.description,
      sections,
    };
  }
}
