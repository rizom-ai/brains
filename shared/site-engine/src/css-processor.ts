import type { Logger } from "@brains/utils";
import { join } from "path";
import { promises as fs } from "fs";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

/**
 * Interface for CSS processing
 */
export interface CSSProcessor {
  process(
    inputCSS: string,
    outputPath: string,
    workingDir: string,
    outputDir: string,
    logger: Logger,
  ): Promise<void>;
}

/**
 * Default Tailwind CSS processor using the JavaScript API
 */
export class TailwindCSSProcessor implements CSSProcessor {
  async process(
    inputCSS: string,
    _outputPath: string,
    _workingDir: string,
    outputDir: string,
    logger: Logger,
  ): Promise<void> {
    logger.debug(`Processing Tailwind CSS for ${outputDir}`);

    try {
      // Find all HTML files in the output directory to scan for Tailwind classes
      const findHtmlFiles = async (dir: string): Promise<string[]> => {
        const files: string[] = [];
        const items = await fs.readdir(dir, { withFileTypes: true });

        for (const item of items) {
          const fullPath = join(dir, item.name);
          if (item.isDirectory()) {
            files.push(...(await findHtmlFiles(fullPath)));
          } else if (item.name.endsWith(".html")) {
            files.push(fullPath);
          }
        }

        return files;
      };

      const htmlFiles = await findHtmlFiles(outputDir);
      logger.debug(
        `Found ${htmlFiles.length} HTML files to scan for Tailwind classes`,
      );

      // Use PostCSS with Tailwind v4 plugin
      // For v4, we don't pass content to the plugin - it should scan based on @source
      const result = await postcss([tailwindcss()]).process(inputCSS, {
        from: join(outputDir, "input.css"), // Set a from path for better resolution
      });

      // Write the compiled CSS
      const outputPath = join(outputDir, "styles", "main.css");
      await fs.mkdir(join(outputDir, "styles"), { recursive: true });
      await fs.writeFile(outputPath, result.css, "utf-8");

      logger.debug("Tailwind CSS processed successfully");
    } catch (error) {
      logger.error("Tailwind CSS build failed", error);

      // Fallback to writing the input CSS as-is if Tailwind fails
      // This ensures the site still has some styling
      const outputPath = join(outputDir, "styles", "main.css");
      await fs.mkdir(join(outputDir, "styles"), { recursive: true });
      await fs.writeFile(outputPath, inputCSS, "utf-8");

      logger.warn("Wrote unprocessed CSS as fallback");
      throw error;
    }
  }
}
