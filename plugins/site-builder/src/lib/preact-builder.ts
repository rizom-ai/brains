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
import { HeadCollector } from "./head-collector";
import { HeadProvider, type HeadProps } from "@brains/ui-library";
import type { ComponentChildren } from "preact";
import { join } from "path";
import { promises as fs } from "fs";
import { HydrationManager } from "../hydration/hydration-manager";
import type { CSSProcessor } from "../css/css-processor";
import { TailwindCSSProcessor } from "../css/css-processor";
import { createHTMLShell } from "./html-generator";
import { z } from "@brains/utils";
import { ImageExtractor } from "./image-extractor";
import { ImageReferenceResolver } from "./image-reference-resolver";
import { createHash } from "crypto";

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

    // Extract images from entity://image references to static files
    onProgress("Extracting images to static files");
    await this.extractAndResolveImages(context);

    // Process styles after HTML is generated (Tailwind needs to scan HTML for classes)
    onProgress("Processing Tailwind CSS");
    await this.processStyles(context.themeCSS ?? "");

    // Copy static assets from public/ directory
    onProgress("Copying static assets");
    await this.copyStaticAssets();

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
    const layoutName = route.layout;
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
    const headCollector = new HeadCollector(context.siteConfig.title);

    // Wrap the layout with HeadProvider so components can use the Head component
    const layoutWithProvider = h(HeadProvider, {
      headCollector,
      children: h(LayoutComponent, layoutProps),
    });

    // Render the layout component with context support
    const layoutHtml = render(layoutWithProvider);

    // Set default head props if no Head component was rendered
    if (!headCollector.getHeadProps()) {
      const headProps: HeadProps = {
        title: route.title,
        description: route.description,
      };

      if (route.path !== "/") {
        headProps.canonicalUrl = route.path;
      }

      headCollector.setHeadProps(headProps);
    }

    // Create full HTML page with head data
    const html = createHTMLShell(
      layoutHtml,
      headCollector.generateHeadHTML(),
      context.siteConfig.title,
      context.siteConfig.themeMode,
    );

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
        this.logger.debug(`No content for section: ${section.id}`);
        continue;
      }

      // Validate content against schema
      // Inject route title as pageTitle for templates that use it (e.g., list pages)
      try {
        const contentObj = z.record(z.unknown()).parse(content);
        const validatedContent = template.schema.parse({
          ...contentObj,
          pageTitle: route.title,
        });

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

  private async copyStaticAssets(): Promise<void> {
    this.logger.debug("Copying static assets from public/ directory");

    // Look for public/ directory in the app root (process.cwd())
    const publicDir = join(process.cwd(), "public");

    try {
      await fs.access(publicDir);
    } catch {
      this.logger.debug("No public/ directory found, skipping static assets");
      return;
    }

    // Read all entries in public directory
    const entries = await fs.readdir(publicDir, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = join(publicDir, entry.name);
      const destPath = join(this.outputDir, entry.name);

      if (entry.isDirectory()) {
        // Recursively copy directories
        await this.copyDirectory(srcPath, destPath);
      } else {
        // Copy file
        await fs.copyFile(srcPath, destPath);
        this.logger.debug(`Copied static asset: ${entry.name}`);
      }
    }

    this.logger.debug("Static assets copied successfully");
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });

    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Extract images from entity://image references and data URLs, resolve them in HTML files.
   * This converts inline references to static file URLs for production builds.
   */
  private async extractAndResolveImages(context: BuildContext): Promise<void> {
    this.logger.debug("Extracting and resolving image references");

    // Collect all HTML files
    const htmlFiles = await this.collectHtmlFiles(this.outputDir);

    if (htmlFiles.length === 0) {
      this.logger.debug("No HTML files found to process");
      return;
    }

    // Read all HTML content
    const htmlContents: string[] = [];
    for (const filePath of htmlFiles) {
      const content = await fs.readFile(filePath, "utf-8");
      htmlContents.push(content);
    }

    const extractor = new ImageExtractor(
      this.outputDir,
      context.pluginContext.entityService,
      this.logger,
    );

    // Extract entity://image references to static files
    const entityImageMap = await extractor.extractFromContent(htmlContents);

    // Extract inline data URLs to static files
    const dataUrlImageMap =
      await extractor.extractDataUrlsFromContent(htmlContents);

    const totalExtracted =
      Object.keys(entityImageMap).length + Object.keys(dataUrlImageMap).length;

    if (totalExtracted === 0) {
      this.logger.debug("No images found to extract");
      return;
    }

    this.logger.debug(`Extracted ${totalExtracted} images to static files`);

    // Process each HTML file
    for (const filePath of htmlFiles) {
      let content = await fs.readFile(filePath, "utf-8");
      let modified = false;

      // Replace entity://image references with static URLs
      if (Object.keys(entityImageMap).length > 0) {
        const resolver = ImageReferenceResolver.static(
          entityImageMap,
          this.logger,
        );
        const result = await resolver.resolve(content);
        if (result.resolvedCount > 0) {
          content = result.content;
          modified = true;
          this.logger.debug(
            `Resolved ${result.resolvedCount} entity://image refs in ${filePath}`,
          );
        }
      }

      // Replace data URLs with static URLs
      if (Object.keys(dataUrlImageMap).length > 0) {
        const dataUrlResult = this.replaceDataUrls(content, dataUrlImageMap);
        if (dataUrlResult.replacedCount > 0) {
          content = dataUrlResult.content;
          modified = true;
          this.logger.debug(
            `Replaced ${dataUrlResult.replacedCount} data URLs in ${filePath}`,
          );
        }
      }

      if (modified) {
        await fs.writeFile(filePath, content, "utf-8");
      }
    }
  }

  /**
   * Replace data URLs in content with static file URLs
   */
  private replaceDataUrls(
    content: string,
    imageMap: { [hash: string]: string },
  ): { content: string; replacedCount: number } {
    let modifiedContent = content;
    let replacedCount = 0;

    // For each hash in the map, find the corresponding data URL and replace it
    for (const [hash, staticUrl] of Object.entries(imageMap)) {
      // Find data URLs that hash to this value
      const dataUrlRegex = /src=(["'])(data:image\/[^"']+)\1/g;
      modifiedContent = modifiedContent.replace(
        dataUrlRegex,
        (match, quote, dataUrl) => {
          // Check if this data URL hashes to the current hash
          const urlHash = this.hashDataUrl(dataUrl);
          if (urlHash === hash) {
            replacedCount++;
            return `src=${quote}${staticUrl}${quote}`;
          }
          return match;
        },
      );
    }

    return { content: modifiedContent, replacedCount };
  }

  /**
   * Generate hash from data URL (same as ImageExtractor)
   */
  private hashDataUrl(dataUrl: string): string {
    return createHash("sha256").update(dataUrl).digest("hex").slice(0, 16);
  }

  /**
   * Recursively collect all HTML files from a directory
   */
  private async collectHtmlFiles(dir: string): Promise<string[]> {
    const htmlFiles: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          const subFiles = await this.collectHtmlFiles(fullPath);
          htmlFiles.push(...subFiles);
        } else if (entry.name.endsWith(".html")) {
          htmlFiles.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist yet, return empty
    }

    return htmlFiles;
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
