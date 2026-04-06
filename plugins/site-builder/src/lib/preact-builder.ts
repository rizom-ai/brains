/// <reference types="../types.d.ts" />
import type {
  StaticSiteBuilder,
  StaticSiteBuilderOptions,
  BuildContext,
  SiteInfo,
} from "./static-site-builder";
import type { ComponentType } from "@brains/plugins";
import type { RouteDefinition } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { render } from "preact-render-to-string";
import { h } from "preact";
import { HeadCollector } from "./head-collector";
import {
  HeadProvider,
  ImageRendererProvider,
  type HeadProps,
} from "@brains/ui-library";
import type { ComponentChildren } from "preact";
import { dirname, join } from "path";
import { promises as fs } from "fs";
import { HydrationManager } from "../hydration/hydration-manager";
import type { CSSProcessor } from "../css/css-processor";
import { TailwindCSSProcessor } from "../css/css-processor";
import { createHTMLShell } from "./html-generator";
import { z, pLimit } from "@brains/utils";

// Import base CSS as text so it's inlined in the bundle (avoids __dirname issues)
import baseCSS from "../styles/base.css" with { type: "text" };

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

    // Build routes concurrently (independent — different paths, content, output files)
    const limit = pLimit(4);
    await Promise.all(
      context.routes.map((route) =>
        limit(async () => {
          onProgress(`Building route: ${route.path}`);
          await this.buildRoute(route, context, siteInfo);
        }),
      ),
    );

    // Process styles after HTML is generated (Tailwind needs to scan HTML for classes)
    onProgress("Processing Tailwind CSS");
    await this.processStyles(context.themeCSS ?? "");

    // Copy static assets from public/ directory
    onProgress("Copying static assets");
    await this.copyStaticAssets();

    // Write inline static assets supplied by the SitePackage (canvas
    // scripts, fonts, etc.) — keyed by output path, values are file
    // contents as strings.
    await this.writeInlineStaticAssets(context.staticAssets);

    // Set up hydration for interactive components
    onProgress("Setting up component hydration");
    const hydrationManager = new HydrationManager(
      this.logger.child("HydrationManager"),
      context.getViewTemplate,
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

    // Remove output directory contents, preserving images/ for sharp cache
    try {
      const entries = await fs.readdir(this.outputDir, {
        withFileTypes: true,
      });
      for (const entry of entries) {
        if (entry.name === "images") continue;
        const fullPath = join(this.outputDir, entry.name);
        await fs.rm(fullPath, { recursive: true, force: true });
      }
    } catch {
      // Output directory may not exist — that's fine
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

    // Check if any section's template requests fullscreen rendering
    const isFullscreen = route.sections.some((section) => {
      const tmpl = context.getViewTemplate(section.template);
      return tmpl?.fullscreen === true;
    });

    // Create head collector for SSR
    const headCollector = new HeadCollector(context.siteConfig.title);

    // Get image renderer for markdown content (if ImageBuildService is available)
    const imageRenderer =
      context.imageBuildService?.createImageRenderer() ?? null;

    let layoutHtml: string;

    if (isFullscreen) {
      // Fullscreen: render sections directly, no page layout shell
      const wrapper = h(HeadProvider, {
        headCollector,
        children: h(ImageRendererProvider, {
          imageRenderer,
          children: h("div", null, ...sectionComponents),
        }),
      });
      layoutHtml = render(wrapper);
    } else {
      // Normal: wrap sections in the site layout
      const layoutName = route.layout;
      const LayoutComponent = context.layouts[layoutName];

      if (!LayoutComponent) {
        this.logger.error(`Layout not found: ${layoutName}`);
        throw new Error(`Layout not found: ${layoutName}`);
      }

      const layoutProps = {
        sections: sectionComponents,
        title: route.title,
        description: route.description,
        path: route.path,
        siteInfo,
        ...(context.slots && { slots: context.slots }),
      };

      const layoutWithProvider = h(HeadProvider, {
        headCollector,
        children: h(ImageRendererProvider, {
          imageRenderer,
          children: h(LayoutComponent, layoutProps),
        }),
      });
      layoutHtml = render(layoutWithProvider);
    }

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
      context.siteConfig.analyticsScript,
      context.headScripts,
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

    // baseCSS is imported at the top of the file as text (inlined in bundle)
    // This avoids __dirname path issues when running from a bundled build

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

  /**
   * Write in-memory static assets supplied by a SitePackage.
   *
   * Keys are output paths relative to the output directory (leading
   * slash optional); values are file contents as strings. The method
   * ensures the parent directory exists, then writes each file.
   *
   * Used by site packages that ship their own static files (canvas
   * scripts, fonts, etc.) without requiring the consuming app to set
   * up a `public/` directory.
   */
  private async writeInlineStaticAssets(
    assets: Record<string, string> | undefined,
  ): Promise<void> {
    if (!assets) return;
    const entries = Object.entries(assets);
    if (entries.length === 0) return;

    this.logger.debug(
      `Writing ${entries.length} inline static asset(s) from SitePackage`,
    );

    for (const [rawPath, content] of entries) {
      // Strip a leading slash so `join(outputDir, rawPath)` always
      // resolves under outputDir rather than treating `rawPath` as an
      // absolute filesystem path.
      const relativePath = rawPath.startsWith("/") ? rawPath.slice(1) : rawPath;
      const destPath = join(this.outputDir, relativePath);
      await fs.mkdir(dirname(destPath), { recursive: true });
      await fs.writeFile(destPath, content, "utf-8");
      this.logger.debug(`Wrote inline static asset: ${relativePath}`);
    }
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
}

/**
 * Factory function to create a Preact builder
 */
export function createPreactBuilder(
  options: StaticSiteBuilderOptions,
): StaticSiteBuilder {
  return new PreactBuilder(options);
}
