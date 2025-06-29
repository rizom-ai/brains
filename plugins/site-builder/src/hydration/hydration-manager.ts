import type { Logger } from "@brains/utils";
import type { PluginContext } from "@brains/plugin-utils";
import type { RouteDefinition, ViewTemplate } from "@brains/view-registry";
import { join } from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";

/**
 * Simplified hydration manager - only handles Preact script injection
 * Components now handle their own hydration
 */
export class HydrationManager {
  private logger: Logger;
  private getViewTemplate: (name: string) => ViewTemplate | undefined;
  private pluginContext: PluginContext;
  private outputDir: string;

  constructor(
    logger: Logger,
    getViewTemplate: (name: string) => ViewTemplate | undefined,
    pluginContext: PluginContext,
    outputDir: string,
  ) {
    this.logger = logger;
    this.getViewTemplate = getViewTemplate;
    this.pluginContext = pluginContext;
    this.outputDir = outputDir;
  }

  /**
   * Process routes to identify components that need hydration
   * Returns the list of interactive template names
   */
  async processRoutes(routes: RouteDefinition[]): Promise<string[]> {
    const interactiveComponents = new Set<string>();

    // Find all interactive components
    for (const route of routes) {
      this.logger.info(
        `Processing route ${route.path} with ${route.sections.length} sections`,
      );
      for (const section of route.sections) {
        this.logger.info(
          `Checking section ${section.id} with template ${section.template}`,
        );
        const template = this.getViewTemplate(section.template);
        if (!template) {
          this.logger.warn(`Template not found: ${section.template}`);
        } else {
          this.logger.info(
            `Template ${section.template}: interactive=${template.interactive}`,
          );
          if (template.interactive) {
            interactiveComponents.add(section.template);
          }
        }
      }
    }

    if (interactiveComponents.size === 0) {
      this.logger.info(
        "No interactive components found, skipping hydration setup",
      );
      return [];
    }

    this.logger.info(
      `Found ${interactiveComponents.size} interactive components using self-hydration`,
    );

    return Array.from(interactiveComponents);
  }

  /**
   * Update HTML files to include Preact scripts and compile hydration scripts
   */
  async updateHTMLFiles(routes: RouteDefinition[]): Promise<void> {
    for (const route of routes) {
      const hasInteractive = route.sections.some((section) => {
        const template = this.getViewTemplate(section.template);
        return template?.interactive;
      });

      if (!hasInteractive) continue;

      const htmlPath =
        route.path === "/"
          ? join(this.outputDir, "index.html")
          : join(this.outputDir, route.path, "index.html");

      try {
        let html = await fs.readFile(htmlPath, "utf8");

        // Add Preact dependencies if not already present
        if (!html.includes("preact.min.js")) {
          const preactScripts = `  <script src="https://unpkg.com/preact@10/dist/preact.min.js"></script>
  <script src="https://unpkg.com/preact@10/hooks/dist/hooks.umd.js"></script>
  <script src="https://unpkg.com/preact@10/compat/dist/compat.umd.js"></script>
  <script>
    // Make Preact available globally for components
    window.preact = {
      h: preact.h,
      hydrate: preact.hydrate,
      render: preact.render,
      Component: preact.Component,
      useState: preactHooks.useState,
      useEffect: preactHooks.useEffect,
      useMemo: preactHooks.useMemo,
      useCallback: preactHooks.useCallback,
      useRef: preactHooks.useRef
    };
  </script>
`;
          html = html.replace("</head>", `${preactScripts}</head>`);
        }

        // Add hydration scripts at the end of body for interactive components
        let hydrationScripts = "";
        for (const section of route.sections) {
          const template = this.getViewTemplate(section.template);
          if (template?.interactive && section.content) {
            // Extract template name from the full template name
            // Format must be "pluginId:templateName" e.g., "site-builder:dashboard"
            const parts = section.template.split(":");
            if (parts.length !== 2 || !parts[0] || !parts[1]) {
              this.logger.error(
                `Invalid template name format: ${section.template}. Expected "pluginId:templateName"`,
              );
              continue;
            }
            const [, templateName] = parts;

            // Add data script and hydration script
            hydrationScripts += `\n<script type="application/json" data-${templateName}-props="true">${JSON.stringify(section.content)}</script>`;
            hydrationScripts += `\n<script src="/${templateName}-hydration.js"></script>`;

            // Get the plugin package name for hydration script resolution
            const packageName = this.pluginContext.getPluginPackageName(
              template.pluginId,
            );
            if (!packageName) {
              this.logger.error(
                `Plugin ${template.pluginId} missing packageName for template ${section.template}`,
              );
              continue;
            }

            // Copy hydration script for this template
            await this.copyHydrationScript(templateName, packageName);
          }
        }

        if (hydrationScripts) {
          // Insert scripts before closing body tag
          html = html.replace("</body>", hydrationScripts + "\n</body>");
        }

        await fs.writeFile(htmlPath, html, "utf8");
        this.logger.info(`Added Preact scripts to ${route.path}`);
      } catch (error) {
        this.logger.error(`Failed to update HTML file ${route.path}:`, error);
      }
    }
  }

  /**
   * Copy pre-compiled hydration script from dist to output directory
   */
  private async copyHydrationScript(
    templateName: string,
    packageName: string,
  ): Promise<void> {
    try {
      // Use import.meta.resolve to find the hydration script
      // This uses the full package name from package.json
      const hydrationScriptUrl = import.meta.resolve(
        `${packageName}/dist/templates/${templateName}/hydration.js`,
      );
      const sourceScript = fileURLToPath(hydrationScriptUrl);

      // Destination: output directory where website is built
      const targetScript = join(this.outputDir, `${templateName}-hydration.js`);

      this.logger.debug(
        `Copying hydration script from ${sourceScript} to ${targetScript}`,
      );

      // Copy the pre-compiled script
      await fs.copyFile(sourceScript, targetScript);

      this.logger.info(`Copied hydration script for ${templateName}`);
    } catch (error) {
      this.logger.error(
        `Failed to copy hydration script for ${templateName}:`,
        error,
      );
      // Add more detailed error information
      if (error instanceof Error) {
        this.logger.error(`Error details: ${error.message}`);
        this.logger.error(`Stack trace: ${error.stack}`);
      }
    }
  }
}
