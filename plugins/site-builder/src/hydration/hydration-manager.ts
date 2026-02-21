import type { Logger } from "@brains/utils";
import type { ServicePluginContext, ViewTemplate } from "@brains/plugins";
import type { RouteDefinition, SectionDefinition } from "@brains/plugins";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";
import * as esbuild from "esbuild";

/**
 * Simplified hydration manager - only handles Preact script injection
 * Components now handle their own hydration
 */
export class HydrationManager {
  private logger: Logger;
  private getViewTemplate: (name: string) => ViewTemplate | undefined;
  private pluginContext: ServicePluginContext;
  private outputDir: string;

  constructor(
    logger: Logger,
    getViewTemplate: (name: string) => ViewTemplate | undefined,
    pluginContext: ServicePluginContext,
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
      this.logger.debug(
        `Processing route ${route.path} with ${route.sections.length} sections`,
      );
      for (const section of route.sections) {
        this.logger.debug(
          `Checking section ${section.id} with template ${section.template}`,
        );
        const template = this.getViewTemplate(section.template);
        if (!template) {
          this.logger.warn(`Template not found: ${section.template}`);
        } else {
          this.logger.debug(
            `Template ${section.template}: interactive=${template.interactive}`,
          );
          if (template.interactive) {
            interactiveComponents.add(section.template);
          }
        }
      }
    }

    if (interactiveComponents.size === 0) {
      this.logger.debug(
        "No interactive components found, skipping hydration setup",
      );
      return [];
    }

    this.logger.debug(
      `Found ${interactiveComponents.size} interactive components using self-hydration`,
    );

    return Array.from(interactiveComponents);
  }

  /**
   * Update HTML files to include Preact scripts and compile hydration scripts
   */
  async updateHTMLFiles(
    routes: RouteDefinition[],
    getContent?: (
      route: RouteDefinition,
      section: SectionDefinition,
    ) => Promise<unknown>,
  ): Promise<void> {
    for (const route of routes) {
      const hasInteractive = route.sections.some(
        (section: SectionDefinition) => {
          const template = this.getViewTemplate(section.template);
          return template?.interactive;
        },
      );

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
  <script src="https://unpkg.com/preact@10/jsx-runtime/dist/jsxRuntime.umd.js"></script>
  <script>
    // Make Preact available globally for components
    window.preact = {
      h: preact.h,
      hydrate: preact.hydrate,
      render: preact.render,
      Component: preact.Component,
      Fragment: preact.Fragment,
      // Automatic JSX runtime functions (allows ui-library components)
      jsx: jsxRuntime.jsx,
      jsxs: jsxRuntime.jsxs,
      jsxDEV: jsxRuntime.jsxDEV,
      // Hooks
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
          if (template?.interactive) {
            // Resolve content using the same logic as the renderer
            let content = section.content;
            if (!content && getContent) {
              content = await getContent(route, section);
            }

            if (!content) {
              this.logger.warn(
                `No content for interactive section: ${section.id}, skipping hydration`,
              );
              continue;
            }

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
            hydrationScripts += `\n<script type="application/json" data-${templateName}-props="true">${JSON.stringify(content)}</script>`;
            hydrationScripts += `\n<script src="/${templateName}-hydration.js"></script>`;

            // Get the plugin package name for hydration script resolution
            const packageName = this.pluginContext.plugins.getPackageName(
              template.pluginId,
            );
            if (!packageName) {
              this.logger.error(
                `Plugin ${template.pluginId} missing packageName for template ${section.template}`,
              );
              continue;
            }

            // Compile hydration script for this template from source
            await this.compileHydrationScript(templateName, packageName);
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
   * Compile hydration script from source at build time
   *
   * This compiles the plugin's hydration.tsx source file directly,
   * eliminating the need for each plugin to have its own build step.
   */
  private async compileHydrationScript(
    templateName: string,
    packageName: string,
  ): Promise<void> {
    try {
      // Resolve the plugin's package location
      const packageUrl = import.meta.resolve(packageName);
      const packagePath = fileURLToPath(packageUrl);
      const packageDir = dirname(packagePath);

      // Source file: {packageDir}/templates/{templateName}/hydration.tsx
      const sourceFile = join(
        packageDir,
        "templates",
        templateName,
        "hydration.tsx",
      );

      // Check if source file exists
      try {
        await fs.access(sourceFile);
      } catch {
        this.logger.error(
          `Hydration source file not found: ${sourceFile}. ` +
            `Expected at: src/templates/${templateName}/hydration.tsx in package ${packageName}`,
        );
        return;
      }

      // Destination: output directory where website is built
      const targetScript = join(this.outputDir, `${templateName}-hydration.js`);

      this.logger.debug(
        `Compiling hydration script from ${sourceFile} to ${targetScript}`,
      );

      // Compile using esbuild with the same config as build:hydration.ts
      await esbuild.build({
        entryPoints: [sourceFile],
        outfile: targetScript,
        bundle: true,
        format: "iife",
        platform: "browser",
        target: ["es2020"],
        external: ["preact", "preact/hooks", "preact/jsx-runtime", "crypto"],
        jsx: "transform",
        jsxFactory: "window.preact.h",
        jsxFragment: "window.preact.Fragment",
        define: {
          "import.meta.env.SSR": "false",
        },
        banner: {
          js: `
// Use global preact from window
const { h, hydrate, useState, useMemo, jsx, jsxs } = window.preact;
// Shim for Node modules that aren't available in browser
var __require = function(mod) {
  if (mod === "crypto") return { randomUUID: () => window.crypto.randomUUID() };
  throw new Error("Cannot require " + mod + " in browser");
};
`,
        },
        write: true,
        sourcemap: false,
        minify: false,
      });

      // Post-process to fix any remaining import statements and hook usage
      let outputCode = await fs.readFile(targetScript, "utf8");

      outputCode = outputCode
        .replace(/import\s*{[^}]+}\s*from\s*["']preact["'];?/g, "")
        .replace(/import\s*{[^}]+}\s*from\s*["']preact\/hooks["'];?/g, "")
        .replace(/var import_hooks = __require\("preact\/hooks"\);/g, "")
        .replace(/\(0, import_hooks\.useState\)/g, "window.preact.useState")
        .replace(/\(0, import_hooks\.useMemo\)/g, "window.preact.useMemo")
        .replace(/\(0, import_hooks\.useEffect\)/g, "window.preact.useEffect")
        .replace(
          /\(0, import_hooks\.useCallback\)/g,
          "window.preact.useCallback",
        )
        .replace(/\(0, import_hooks\.useRef\)/g, "window.preact.useRef")
        .replace(/__require\("preact[^"]*"\)/g, "window.preact");

      await fs.writeFile(targetScript, outputCode, "utf8");

      this.logger.info(`Compiled hydration script for ${templateName}`);
    } catch (error) {
      this.logger.error(
        `Failed to compile hydration script for ${templateName}:`,
        error,
      );
      if (error instanceof Error) {
        this.logger.error(`Error details: ${error.message}`);
        this.logger.error(`Stack trace: ${error.stack}`);
      }
    }
  }
}
