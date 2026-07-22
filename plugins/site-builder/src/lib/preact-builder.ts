/// <reference types="../types.d.ts" />
import type {
  StaticSiteBuilder,
  StaticSiteBuilderOptions,
  BuildContext,
} from "./static-site-builder";
import type { Logger } from "@brains/utils/logger";
import type { ProgressNotification } from "@brains/utils/progress";
import { render } from "preact-render-to-string";
import { h } from "preact";
import {
  HeadProvider,
  ImageRendererProvider,
  type HeadProps,
} from "@brains/ui-library";
import type { ComponentChildren } from "preact";
import { dirname, join } from "path";
import { promises as fs } from "fs";
import {
  createHTMLShell,
  createSiteImageRenderer,
  HeadCollector,
  TailwindCSSProcessor,
  type CSSProcessor,
  type PreparedRoute,
  type PreparedSiteBuild,
} from "@brains/site-engine";
import { pLimit } from "@brains/utils/p-limit";
// Import base CSS as text so it's inlined in the bundle (avoids __dirname issues)
import baseCSS from "../styles/base.css" with { type: "text" };
import { resolveSafeOutputFile } from "./output-path";

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
    onProgress: (notification: ProgressNotification) => void,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    const { preparedBuild } = context;
    const total = preparedBuild.routes.length + 4;
    let progress = 0;
    const reportProgress = (message: string): void => {
      progress++;
      onProgress({ message, progress, total });
    };

    reportProgress("Starting Preact build");

    // Create output directory
    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.mkdir(join(this.outputDir, "styles"), { recursive: true });
    signal.throwIfAborted();

    // Build routes concurrently from the immutable prepared snapshot.
    const limit = pLimit(4);
    const routeResults = await Promise.allSettled(
      preparedBuild.routes.map((route) =>
        limit(async () => {
          signal.throwIfAborted();
          reportProgress(`Building route: ${route.path}`);
          await this.buildRoute(route, context, preparedBuild, signal);
        }),
      ),
    );
    signal.throwIfAborted();
    const rejectedRoute = routeResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (rejectedRoute) throw rejectedRoute.reason;

    // Process styles after HTML is generated (Tailwind needs to scan HTML for classes)
    reportProgress("Processing Tailwind CSS");
    await this.processStyles(preparedBuild.themeCSS ?? "", signal);

    // Write app public files captured during build preparation.
    reportProgress("Copying static assets");
    await this.writePublicAssets(preparedBuild.publicAssets, signal);

    // Write inline static assets: files declared by templates in use on the
    // built routes (e.g. the file behind a runtimeScripts src), merged with
    // assets supplied by the SitePackage (canvas scripts, fonts, etc.) —
    // keyed by output path, values are file contents as strings. On a path
    // collision the SitePackage wins.
    await this.writeInlineStaticAssets(preparedBuild.staticAssets, signal);
    signal.throwIfAborted();

    reportProgress("Preact build complete");
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
    route: PreparedRoute,
    context: BuildContext,
    preparedBuild: PreparedSiteBuild,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    this.logger.debug(`Building route: ${route.path}`);

    const sectionComponents = this.createSectionComponents(
      route.sections,
      context,
    );
    const siteLayoutInfo = preparedBuild.site;

    // Create head collector for SSR
    const headCollector = new HeadCollector(preparedBuild.site.title);

    // Get image renderer for markdown content (if ImageBuildService is available)
    const imageRenderer = createSiteImageRenderer(preparedBuild.images);

    let layoutHtml: string;

    if (route.fullscreen) {
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

      const resolvedTitle = route.title || siteLayoutInfo.title;
      const resolvedDescription =
        route.description || siteLayoutInfo.description;

      const layoutProps = {
        sections: sectionComponents,
        title: resolvedTitle,
        description: resolvedDescription,
        path: route.path,
        siteInfo: siteLayoutInfo,
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
    signal.throwIfAborted();

    // Set default head props if no Head component was rendered
    if (!headCollector.getHeadProps()) {
      const headProps: HeadProps = {
        title: route.title || siteLayoutInfo.title,
        description: route.description || siteLayoutInfo.description,
      };

      if (route.path !== "/") {
        headProps.canonicalUrl = route.path;
      }

      headCollector.setHeadProps(headProps);
    }

    const allHeadScripts = [
      ...preparedBuild.globalHeadScripts,
      ...route.headScripts,
    ];

    // Create full HTML page with head data
    const html = createHTMLShell(
      layoutHtml,
      headCollector.generateHeadHTML(),
      preparedBuild.site.title,
      preparedBuild.site.themeMode,
      preparedBuild.site.analyticsScript,
      allHeadScripts,
    );

    // Determine output path
    const outputPath =
      route.path === "/" ? "index.html" : `${route.path.slice(1)}/index.html`;
    const fullPath = resolveSafeOutputFile(this.outputDir, outputPath);

    // Ensure directory exists
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    if (dir) {
      await fs.mkdir(dir, { recursive: true });
    }

    await fs.writeFile(fullPath, html, { encoding: "utf-8", signal });
  }

  private createSectionComponents(
    sections: PreparedRoute["sections"],
    context: BuildContext,
  ): ComponentChildren[] {
    const sectionComponents: ComponentChildren[] = [];

    for (const section of sections) {
      const template = context.viewTemplates[section.template];
      const renderer = template?.renderers.web;
      if (!renderer || typeof renderer !== "function") {
        throw new Error(
          `Prepared template binding not found: ${section.template}`,
        );
      }

      sectionComponents.push(h(renderer, section.data));
      this.logger.debug(`Created component for section ${section.id}`);
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

  private async processStyles(
    themeCSS: string,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
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
      signal,
    );
    signal.throwIfAborted();

    // Read processed CSS and prepend font imports
    const processedCSS = await fs.readFile(outputPath, {
      encoding: "utf-8",
      signal,
    });

    // Theme imports override base imports (if theme has fonts, use only those)
    const finalImports = themeImports.length > 0 ? themeImports : baseImports;

    if (finalImports.length > 0) {
      const finalCSS = finalImports.join("\n") + "\n\n" + processedCSS;
      await fs.writeFile(outputPath, finalCSS, {
        encoding: "utf-8",
        signal,
      });
    }

    this.logger.debug("CSS processed successfully with font imports");
  }

  private async writePublicAssets(
    assets: Record<string, string>,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    const entries = Object.entries(assets);
    if (entries.length === 0) return;

    this.logger.debug(`Writing ${entries.length} snapshotted public asset(s)`);
    for (const [assetPath, contentBase64] of entries) {
      signal.throwIfAborted();
      const destPath = resolveSafeOutputFile(this.outputDir, assetPath);
      await fs.mkdir(dirname(destPath), { recursive: true });
      await fs.writeFile(destPath, Buffer.from(contentBase64, "base64"), {
        signal,
      });
      this.logger.debug(`Wrote public asset: ${assetPath}`);
    }
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
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    if (!assets) return;
    const entries = Object.entries(assets);
    if (entries.length === 0) return;

    this.logger.debug(
      `Writing ${entries.length} inline static asset(s) from SitePackage`,
    );

    const writeResults = await Promise.allSettled(
      entries.map(async ([rawPath, content]) => {
        signal.throwIfAborted();
        const destPath = resolveSafeOutputFile(this.outputDir, rawPath);
        await fs.mkdir(dirname(destPath), { recursive: true });
        await fs.writeFile(destPath, content, {
          encoding: "utf-8",
          signal,
        });
        this.logger.debug(`Wrote inline static asset: ${rawPath}`);
      }),
    );
    signal.throwIfAborted();
    const rejectedWrite = writeResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (rejectedWrite) throw rejectedWrite.reason;
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
