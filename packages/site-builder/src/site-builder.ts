import type { ProgressCallback } from "@brains/utils";
import { ProgressReporter } from "@brains/utils";
import type {
  SiteBuilder as ISiteBuilder,
  SiteBuilderOptions,
  BuildResult,
  PageDefinition,
  ContentGenerationRequest,
} from "./types";
import { PageRegistry } from "./page-registry";
import { LayoutRegistry } from "./layout-registry";
import { builtInLayouts } from "./layout-schemas";

export class SiteBuilder implements ISiteBuilder {
  private static instance: SiteBuilder | null = null;
  private pageRegistry: PageRegistry;
  private layoutRegistry: LayoutRegistry;

  public static getInstance(): SiteBuilder {
    SiteBuilder.instance ??= new SiteBuilder();
    return SiteBuilder.instance;
  }

  public static resetInstance(): void {
    SiteBuilder.instance = null;
  }

  public static createFresh(): SiteBuilder {
    return new SiteBuilder();
  }

  private constructor() {
    this.pageRegistry = PageRegistry.getInstance();
    this.layoutRegistry = LayoutRegistry.getInstance();

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

      // Get all registered pages
      const pages = this.pageRegistry.list();
      if (pages.length === 0) {
        warnings.push("No pages registered for site build");
      }

      await reporter?.report(`Building ${pages.length} pages`, 10, 100);

      // Build each page
      let pagesBuilt = 0;
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        if (!page) {
          continue;
        }
        const pageProgress = 10 + (i / pages.length) * 80;

        await reporter?.report(
          `Building page: ${page.path}`,
          pageProgress,
          100,
        );

        try {
          await this.buildPage(page, options, reporter);
          pagesBuilt++;
        } catch (error) {
          errors.push(
            `Failed to build page ${page.path}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

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

    // TODO: Actually generate the static files
    // This will be implemented when we integrate with Astro
    // For now, we're just validating and preparing content
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
}
