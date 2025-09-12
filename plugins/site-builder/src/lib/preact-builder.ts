import type {
  StaticSiteBuilder,
  StaticSiteBuilderOptions,
  BuildContext,
  SiteInfo,
} from "./static-site-builder";
import type { ComponentType } from "@brains/plugins";
import type { RouteDefinition } from "../types/routes";
import type { Logger } from "@brains/plugins";
import { render } from "preact-render-to-string";
import { h } from "preact";
import { HeadCollector, type HeadProps } from "./head-collector";
import type { ComponentChildren } from "preact";
import { join } from "path";
import { promises as fs } from "fs";
import { HydrationManager } from "../hydration/hydration-manager";
import type { CSSProcessor } from "../css/css-processor";
import { TailwindCSSProcessor } from "../css/css-processor";
import { createHTMLShell } from "./html-generator";

/**
 * Preact-based static site builder
 */
export class PreactBuilder implements StaticSiteBuilder {
  private logger: Logger;
  private workingDir: string;
  private outputDir: string;
  private cssProcessor: CSSProcessor;

  constructor(options: StaticSiteBuilderOptions) {
    this.logger = options.logger;
    this.workingDir = options.workingDir;
    this.outputDir = options.outputDir;
    this.cssProcessor = options.cssProcessor ?? new TailwindCSSProcessor();
  }

  async build(
    context: BuildContext,
    onProgress: (message: string) => void,
  ): Promise<void> {
    onProgress("Starting Preact build");

    // Create output directory
    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.mkdir(join(this.outputDir, "styles"), { recursive: true });

    // Fetch site info once for all routes
    const siteInfo = await context.getSiteInfo();

    // Build each route first (HTML files)
    for (const route of context.routes) {
      onProgress(`Building route: ${route.path}`);
      await this.buildRoute(route, context, siteInfo);
    }

    // Process styles after HTML is generated (Tailwind needs to scan HTML for classes)
    onProgress("Processing Tailwind CSS");
    await this.processStyles(context.themeCSS || "");

    // Set up hydration for interactive components
    onProgress("Setting up component hydration");
    const hydrationManager = new HydrationManager(
      this.logger.child("HydrationManager"),
      context.getViewTemplate,
      context.pluginContext,
      this.outputDir,
    );

    const interactiveTemplates = await hydrationManager.processRoutes(
      context.routes,
    );

    if (interactiveTemplates.length > 0) {
      await hydrationManager.updateHTMLFiles(
        context.routes,
        context.getContent,
      );
    }

    onProgress("Preact build complete");
  }

  async clean(): Promise<void> {
    this.logger.debug("Cleaning build artifacts");

    // Remove working directory
    try {
      await fs.rm(this.workingDir, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn(`Failed to clean working directory: ${error}`);
    }

    // Remove output directory
    try {
      await fs.rm(this.outputDir, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn(`Failed to clean output directory: ${error}`);
    }
  }

  private async buildRoute(
    route: RouteDefinition,
    context: BuildContext,
    siteInfo: SiteInfo,
  ): Promise<void> {
    this.logger.debug(`Building route: ${route.path}`);

    // Create section components (filter out footer - it will be in layout)
    const contentSections = route.sections.filter(
      (s) => s.template !== "footer",
    );
    const sectionComponents = await this.createSectionComponents(
      route,
      contentSections,
      context,
    );

    // Get the layout component (guaranteed to exist)
    const layoutName = route.layout || "default";
    const LayoutComponent = context.layouts[layoutName];

    if (!LayoutComponent) {
      this.logger.error(`Layout not found: ${layoutName}`);
      throw new Error(`Layout not found: ${layoutName}`);
    }

    // Use layout to compose the page with JSX sections
    const layoutProps = {
      sections: sectionComponents,
      title: route.title,
      description: route.description,
      path: route.path,
      siteInfo,
    };

    // Create head collector for SSR
    const headCollector = new HeadCollector();

    // Render the layout component
    // TODO: Pass headCollector through context when we implement proper context support
    const layoutHtml = render(h(LayoutComponent, layoutProps));

    // For now, we'll use a simple default head
    // In a real implementation, we'd collect head props from the Head component
    const headProps: HeadProps = {
      title: route.title || siteInfo.title || "Personal Brain",
      description: route.description || siteInfo.description,
    };

    if (route.path !== "/") {
      headProps.canonicalUrl = route.path;
    }

    headCollector.setHeadProps(headProps);

    // Create full HTML page with head data
    const html = createHTMLShell(layoutHtml, headCollector.generateHeadHTML());

    // Determine output path
    const outputPath =
      route.path === "/" ? "index.html" : `${route.path.slice(1)}/index.html`;
    const fullPath = join(this.outputDir, outputPath);

    // Ensure directory exists
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    if (dir) {
      await fs.mkdir(dir, { recursive: true });
    }

    await fs.writeFile(fullPath, html, "utf-8");
  }

  private async createSectionComponents(
    route: RouteDefinition,
    sections: RouteDefinition["sections"],
    context: BuildContext,
  ): Promise<ComponentChildren[]> {
    const sectionComponents: ComponentChildren[] = [];

    for (const section of sections) {
      const template = context.getViewTemplate(section.template);
      if (!template) {
        this.logger.warn(`Template not found: ${section.template}`);
        continue;
      }

      const renderer = template.renderers.web;
      if (!renderer || typeof renderer !== "function") {
        this.logger.warn(`No web renderer for template: ${section.template}`);
        continue;
      }

      // Always get content through context to allow dynamic resolution
      const content = await context.getContent(route, section);

      if (!content) {
        this.logger.warn(`No content for section: ${section.id}`);
        continue;
      }

      // Validate content against schema
      try {
        const validatedContent = template.schema.parse(content);

        // Create component using h() to pass props correctly
        // renderer is already checked to be a function, so we can cast it to ComponentType
        // We cast validatedContent to Record<string, unknown> since we know it's an object after schema validation
        const ComponentFunc = renderer as ComponentType<
          Record<string, unknown>
        >;
        const component = h(
          ComponentFunc,
          validatedContent as Record<string, unknown>,
        );

        sectionComponents.push(component);
        this.logger.debug(`Created component for section ${section.id}`);
      } catch (error) {
        this.logger.error(
          `Failed to create section component ${section.id}:`,
          error,
        );
      }
    }

    return sectionComponents;
  }

  private extractFontImports(css: string): {
    imports: string[];
    cssWithoutImports: string;
  } {
    const fontImportRegex =
      /@import\s+url\([^)]+(?:fonts\.googleapis|fonts\.gstatic)[^)]*\)[^;]*;/g;
    const imports: string[] = [];

    const cssWithoutImports = css.replace(fontImportRegex, (match) => {
      imports.push(match);
      return "";
    });

    return { imports, cssWithoutImports };
  }

  private async processStyles(themeCSS: string): Promise<void> {
    this.logger.debug("Processing CSS styles");

    const inputPath = join(__dirname, "../styles/base.css");
    const baseCSS = await fs.readFile(inputPath, "utf-8");

    // Extract font imports from base and theme CSS
    const { imports: baseImports, cssWithoutImports: baseCSSClean } =
      this.extractFontImports(baseCSS);
    const { imports: themeImports, cssWithoutImports: themeCSSClean } =
      this.extractFontImports(themeCSS);

    // Build CSS for Tailwind processing (without font imports)
    const cssForTailwind = themeCSSClean
      ? baseCSSClean + "\n\n/* Custom Theme Overrides */\n" + themeCSSClean
      : baseCSSClean;

    const outputPath = join(this.outputDir, "styles", "main.css");

    // Process with Tailwind
    await this.cssProcessor.process(
      cssForTailwind,
      outputPath,
      this.workingDir,
      this.outputDir,
      this.logger,
    );

    // Read processed CSS and prepend font imports
    const processedCSS = await fs.readFile(outputPath, "utf-8");

    // Theme imports override base imports (if theme has fonts, use only those)
    const finalImports = themeImports.length > 0 ? themeImports : baseImports;

    if (finalImports.length > 0) {
      const finalCSS = finalImports.join("\n") + "\n\n" + processedCSS;
      await fs.writeFile(outputPath, finalCSS, "utf-8");
    }

    this.logger.debug("CSS processed successfully with font imports");
  }
}

/**
 * Factory function to create a Preact builder
 */
export function createPreactBuilder(
  options: StaticSiteBuilderOptions,
): StaticSiteBuilder {
  return new PreactBuilder(options);
}
