import type {
  StaticSiteBuilder,
  StaticSiteBuilderOptions,
  BuildContext,
} from "./static-site-builder";
import type { RouteDefinition } from "@brains/types";
import type { Logger } from "@brains/utils";
import { render } from "preact-render-to-string";
import { join } from "path";
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

    // Build each route
    for (const route of context.routes) {
      onProgress?.(`Building route: ${route.path}`);
      await this.buildRoute(route, context);
    }

    // Process styles (TODO: integrate Tailwind)
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
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title}</title>
  ${options.description ? `<meta name="description" content="${options.description}">` : ""}
  <link rel="stylesheet" href="/styles/main.css">
</head>
<body>
  ${options.content}
</body>
</html>`;
  }

  private async processStyles(): Promise<void> {
    // TODO: Process Tailwind CSS
    // For now, create a basic CSS file
    const basicCSS = `
/* Basic reset and Tailwind directives */
@tailwind base;
@tailwind components;
@tailwind utilities;
`;

    await fs.writeFile(
      join(this.outputDir, "styles", "main.css"),
      basicCSS,
      "utf-8",
    );
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
