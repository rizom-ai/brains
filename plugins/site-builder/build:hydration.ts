#!/usr/bin/env bun

/**
 * Build script to compile hydration scripts for site-builder templates
 * This runs during the package build to pre-compile JSX hydration scripts
 */

import { readdir, mkdir } from "fs/promises";
import { join } from "path";
import * as esbuild from "esbuild";

async function buildHydrationScripts() {
  console.log("Building hydration scripts...");

  try {
    // Ensure dist directory exists
    await mkdir("dist/templates", { recursive: true });

    // Find all template directories
    const templatesDir = "src/templates";
    const templates = await readdir(templatesDir, { withFileTypes: true });

    for (const template of templates) {
      if (template.isDirectory()) {
        const templateName = template.name;
        const hydrationFile = join(templatesDir, templateName, "hydration.tsx");
        const outputFile = join("dist/templates", templateName, "hydration.js");

        console.log(`Compiling ${templateName} hydration script...`);

        // Ensure output directory exists
        await mkdir(join("dist/templates", templateName), { recursive: true });

        // Use ESBuild to compile the hydration script WITH its dependencies
        try {
          const result = await esbuild.build({
            entryPoints: [hydrationFile],
            outfile: outputFile,
            bundle: true,
            format: "iife", // Immediately Invoked Function Expression
            platform: "browser",
            target: ["es2020"],
            external: [
              "preact",
              "preact/hooks",
              "preact/jsx-runtime",
              "crypto", // Node built-in, not needed for browser hydration
            ],
            jsx: "transform",
            jsxFactory: "window.preact.h",
            jsxFragment: "window.preact.Fragment",
            // Replace imports with window.preact references
            define: {
              "import.meta.env.SSR": "false",
            },
            banner: {
              js: `
// Use global preact from window
const { h, hydrate, useState, useMemo, jsx, jsxs } = window.preact;
`,
            },
            write: true,
            sourcemap: false,
            minify: false,
          });

          console.log(`✓ Compiled ${templateName} hydration script`);

          // Post-process to fix any remaining import statements and hook usage
          let outputCode = await Bun.file(outputFile).text();

          // Remove any remaining preact imports that esbuild didn't handle
          outputCode = outputCode
            .replace(/import\s*{[^}]+}\s*from\s*["']preact["'];?/g, "")
            .replace(/import\s*{[^}]+}\s*from\s*["']preact\/hooks["'];?/g, "")
            // Fix hook imports
            .replace(/var import_hooks = __require\("preact\/hooks"\);/g, "")
            .replace(/\(0, import_hooks\.useState\)/g, "window.preact.useState")
            .replace(/\(0, import_hooks\.useMemo\)/g, "window.preact.useMemo")
            .replace(
              /\(0, import_hooks\.useEffect\)/g,
              "window.preact.useEffect",
            )
            .replace(
              /\(0, import_hooks\.useCallback\)/g,
              "window.preact.useCallback",
            )
            .replace(/\(0, import_hooks\.useRef\)/g, "window.preact.useRef")
            // Remove any __require calls for preact
            .replace(/__require\("preact[^"]*"\)/g, "window.preact");

          await Bun.write(outputFile, outputCode);
        } catch (error) {
          console.error(`✗ Failed to compile ${templateName}:`, error);
        }
      }
    }

    console.log("Hydration scripts build complete!");
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

// Run the build
buildHydrationScripts();
