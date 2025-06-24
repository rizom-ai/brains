import type {
  StaticSiteBuilder,
  StaticSiteBuilderOptions,
  BuildContext,
} from "./static-site-builder";
import type { RouteDefinition } from "@brains/types";
import type { Logger } from "@brains/utils";
import { render } from "preact-render-to-string";
import { join, relative } from "path";
import { promises as fs } from "fs";

/**
 * Preact-based static site builder
 */
export class PreactBuilder implements StaticSiteBuilder {
  private logger: Logger;
  private workingDir: string;
  private outputDir: string;

  constructor(options: StaticSiteBuilderOptions) {
    this.logger = options.logger;
    this.workingDir = options.workingDir;
    this.outputDir = options.outputDir;
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
        // Render component to string
        const component = renderer(validatedContent);
        const html = render(component);
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
<body class="h-full bg-white">
  <div id="root" class="min-h-full">
    ${options.content}
  </div>
</body>
</html>`;
  }

  private async processStyles(): Promise<void> {
    this.logger.info("Processing Tailwind CSS v4");

    // Create the CSS input with Tailwind v4's import and theme variables
    const inputCSS = `@import "tailwindcss";

/* Theme Layer - CSS Custom Properties for theming */
@layer theme {
  :root {
    /* Brand Colors */
    --color-brand: #805ad5;
    --color-brand-dark: #6b46c1;
    --color-brand-light: #e9d8fd;
    --color-accent: #3182ce;
    
    /* Semantic Colors */
    --color-text: #1a202c;
    --color-text-muted: #718096;
    --color-text-inverse: #ffffff;
    
    /* Background Colors */
    --color-bg: #ffffff;
    --color-bg-subtle: #f7fafc;
    --color-bg-muted: #e2e8f0;
    
    /* Typography */
    --font-family-sans: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
    --font-family-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
    --font-family-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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
}`;

    // Create input file
    const inputPath = join(this.workingDir, "input.css");
    await fs.mkdir(this.workingDir, { recursive: true });
    await fs.writeFile(inputPath, inputCSS, "utf-8");

    // Output path
    const outputPath = join(this.outputDir, "styles", "main.css");

    try {
      // Use Tailwind CLI - this is the recommended approach for v4
      const { execSync } = await import("child_process");

      // Build the command - v4 has automatic content detection
      // Run from the output directory so Tailwind can find the HTML files
      const relativeInputPath = join("..", relative(this.outputDir, inputPath));
      const relativeOutputPath = "styles/main.css";
      const command = `bunx @tailwindcss/cli -i "${relativeInputPath}" -o "${relativeOutputPath}"`;

      this.logger.info(`Running Tailwind CSS v4 from ${this.outputDir}`);
      this.logger.debug(`Command: ${command}`);

      execSync(command, {
        stdio: "inherit", // Let's see the output
        cwd: this.outputDir, // Run from output directory
      });

      this.logger.info("Tailwind CSS processed successfully");

      // Clean up temp file
      await fs.unlink(inputPath).catch(() => {});
    } catch (error) {
      this.logger.warn("Failed to process Tailwind CSS:", error);

      // Fallback: write basic CSS that imports Tailwind
      // This won't have the optimizations but will work for development
      const fallbackCSS = `/* Tailwind CSS v4 - Fallback Mode */
@import "tailwindcss";

/* Note: Run 'bunx tailwindcss -i input.css -o main.css' manually for optimized CSS */
`;
      await fs.writeFile(outputPath, fallbackCSS, "utf-8");
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
