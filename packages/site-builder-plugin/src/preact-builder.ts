import type {
  StaticSiteBuilder,
  StaticSiteBuilderOptions,
  BuildContext,
} from "./static-site-builder";
import type { RouteDefinition, ComponentType } from "@brains/types";
import type { Logger } from "@brains/utils";
import { render } from "preact-render-to-string";
import { h } from "preact";
import { join } from "path";
import { promises as fs } from "fs";
import { HydrationManager } from "./hydration/hydration-manager";
import type { CSSProcessor } from "./css/css-processor";
import { TailwindCSSProcessor } from "./css/css-processor";

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
    onProgress?: (message: string) => void,
  ): Promise<void> {
    onProgress?.("Starting Preact build");

    // Create output directory
    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.mkdir(join(this.outputDir, "styles"), { recursive: true });

    // Build each route first (HTML files)
    for (const route of context.routes) {
      onProgress?.(`Building route: ${route.path}`);
      await this.buildRoute(route, context);
    }

    // Process styles after HTML is generated (Tailwind needs to scan HTML for classes)
    onProgress?.("Processing Tailwind CSS");
    await this.processStyles();

    // Set up hydration for interactive components
    onProgress?.("Setting up component hydration");
    const hydrationManager = new HydrationManager(
      this.logger.child("HydrationManager"),
      context.viewRegistry,
      context.pluginContext,
      this.outputDir,
    );

    const interactiveTemplates = await hydrationManager.processRoutes(
      context.routes,
    );

    if (interactiveTemplates.length > 0) {
      await hydrationManager.updateHTMLFiles(context.routes);
    }

    onProgress?.("Preact build complete");
  }

  async clean(): Promise<void> {
    this.logger.info("Cleaning build artifacts");

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
  ): Promise<void> {
    this.logger.info(`Building route: ${route.path}`);

    // Render sections
    const sections = await this.renderSections(route.sections, context);

    // Create full HTML page
    const html = this.createHTMLPage({
      title: route.title,
      description: route.description,
      content: sections.join("\n"),
    });

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

  private async renderSections(
    sections: RouteDefinition["sections"],
    context: BuildContext,
  ): Promise<string[]> {
    const renderedSections: string[] = [];

    for (const section of sections) {
      const template = context.viewRegistry.getViewTemplate(section.template);
      if (!template) {
        this.logger.warn(`Template not found: ${section.template}`);
        continue;
      }

      const renderer = template.renderers.web;
      if (!renderer || typeof renderer !== "function") {
        this.logger.warn(`No web renderer for template: ${section.template}`);
        continue;
      }

      // Get content from entity or use provided content
      let content = section.content;
      if (!content && section.contentEntity) {
        content = await context.getContent(section);
      }

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

        const html = render(component);
        this.logger.info(
          `Rendered HTML length for ${section.id}: ${html.length}`,
        );

        renderedSections.push(html);
      } catch (error) {
        this.logger.error(`Failed to render section ${section.id}:`, error);
      }
    }

    return renderedSections;
  }

  private createHTMLPage(options: {
    title: string;
    description: string;
    content: string;
  }): string {
    return `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${options.title}</title>
  ${options.description ? `<meta name="description" content="${options.description}">` : ""}
  
  <!-- Favicons -->
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="icon" type="image/png" href="/favicon.png">
  
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap" rel="stylesheet">
  
  <!-- Styles -->
  <link rel="stylesheet" href="/styles/main.css">
  
  <!-- Open Graph -->
  <meta property="og:title" content="${options.title}">
  ${options.description ? `<meta property="og:description" content="${options.description}">` : ""}
  <meta property="og:type" content="website">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${options.title}">
  ${options.description ? `<meta name="twitter:description" content="${options.description}">` : ""}
</head>
<body class="h-full bg-white font-sans">
  <div id="root" class="min-h-full">
    ${options.content}
  </div>
</body>
</html>`;
  }

  private async processStyles(): Promise<void> {
    this.logger.info("Processing CSS styles");

    const inputCSS = this.createTailwindInput();
    const outputPath = join(this.outputDir, "styles", "main.css");

    await this.cssProcessor.process(
      inputCSS,
      outputPath,
      this.workingDir,
      this.outputDir,
      this.logger,
    );
    this.logger.info("CSS processed successfully");
  }

  private createTailwindInput(): string {
    return `@import "tailwindcss";

/* Theme Layer - CSS Custom Properties for theming */
@layer theme {
  :root {
    /* Brand Colors - Updated to purple/orange theme */
    --color-brand: #6366f1;
    --color-brand-dark: #4f46e5;
    --color-brand-light: #a5b4fc;
    --color-accent: #ea580c;
    
    /* Semantic Colors */
    --color-text: #1a202c;
    --color-text-muted: #718096;
    --color-text-inverse: #ffffff;
    
    /* Background Colors */
    --color-bg: #ffffff;
    --color-bg-subtle: #f7fafc;
    --color-bg-muted: #e2e8f0;
    
    /* Typography - Updated to DM Sans */
    --font-family-sans: 'DM Sans', 'Inter', ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
    --font-family-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
    --font-family-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
}

/* Base layer - Set DM Sans as default font */
@layer base {
  :root {
    --font-sans: 'DM Sans', 'Inter', ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  }
  
  body {
    font-family: 'DM Sans', 'Inter', ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  }
}

/* Utility classes that use theme variables */
@layer utilities {
  /* Text colors using theme variables */
  .text-theme { color: var(--color-text); }
  .text-theme-muted { color: var(--color-text-muted); }
  .text-theme-inverse { color: var(--color-text-inverse); }
  .text-brand { color: var(--color-brand); }
  
  /* Background colors using theme variables */
  .bg-theme { background-color: var(--color-bg); }
  .bg-theme-subtle { background-color: var(--color-bg-subtle); }
  .bg-brand { background-color: var(--color-brand); }
  .bg-brand-dark { background-color: var(--color-brand-dark); }
  
  /* Interactive states */
  .hover\\:bg-brand-dark:hover { background-color: var(--color-brand-dark); }
  .hover\\:text-brand:hover { color: var(--color-brand); }
  
  /* Borders */
  .border-brand-light { border-color: var(--color-brand-light); }
  .hover\\:border-brand-light:hover { border-color: var(--color-brand-light); }
  
  /* Gradients - Tailwind v4 format */
  .from-brand-dark { 
    --tw-gradient-from: var(--color-brand-dark);
    --tw-gradient-to: rgb(from var(--color-brand-dark) r g b / 0);
    --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to);
  }
  .from-brand-light { 
    --tw-gradient-from: var(--color-brand-light);
    --tw-gradient-to: rgb(from var(--color-brand-light) r g b / 0);
    --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to);
  }
  .to-brand { 
    --tw-gradient-to: var(--color-brand);
  }
  .to-theme { 
    --tw-gradient-to: var(--color-bg);
  }
}

/* Hero Background Components */
@layer components {
  /* Hero background pattern (dot grid) */
  .hero-bg-pattern {
    background-image: radial-gradient(circle at 1px 1px, rgb(99 102 241) 1px, transparent 0);
    background-size: 20px 20px;
  }
  
  /* CTA background pattern (larger dots) */
  .cta-bg-pattern {
    background-image: radial-gradient(circle at 2px 2px, rgba(255, 255, 255, 0.15) 1px, transparent 0);
    background-size: 40px 40px;
  }
}

/* Blob Animations */
@keyframes blob {
  0% {
    transform: translate(0px, 0px) scale(1);
  }
  33% {
    transform: translate(30px, -50px) scale(1.1);
  }
  66% {
    transform: translate(-20px, 20px) scale(0.9);
  }
  100% {
    transform: translate(0px, 0px) scale(1);
  }
}

/* Animation utilities */
@layer utilities {
  .animate-blob {
    animation: blob 7s infinite;
  }
  
  .animation-delay-2000 {
    animation-delay: 2s;
  }
  
  .animation-delay-4000 {
    animation-delay: 4s;
  }
}`;
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
