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

    // Use PostCSS with Tailwind v4 plugin
    // For v4, we don't pass content to the plugin - it scans based on @source
    const result = await postcss([tailwindcss()]).process(inputCSS, {
      from: join(outputDir, "input.css"), // Set a from path for better resolution
    });

    // Write the compiled CSS
    const outputPath = join(outputDir, "styles", "main.css");
    await fs.mkdir(join(outputDir, "styles"), { recursive: true });
    await fs.writeFile(outputPath, result.css, "utf-8");

    logger.debug("Tailwind CSS processed successfully");
  }
}
