import type { Logger } from "@brains/utils/logger";
import { join, relative, sep } from "path";
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
    signal: AbortSignal,
    /** Files Tailwind reads for utilities besides the stylesheet's own sources. */
    sources?: readonly string[],
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
    signal: AbortSignal,
    sources: readonly string[] = [],
  ): Promise<void> {
    signal.throwIfAborted();
    logger.debug(`Processing Tailwind CSS for ${outputDir}`);

    // A source is relative to the stylesheet, which Tailwind places in the
    // output directory.
    const sourceDirectives = sources.map(
      (file) =>
        `@source ${JSON.stringify(relative(outputDir, file).split(sep).join("/"))};`,
    );
    const css =
      sourceDirectives.length > 0
        ? `${inputCSS}\n${sourceDirectives.join("\n")}\n`
        : inputCSS;

    // Use PostCSS with Tailwind v4 plugin
    // For v4, we don't pass content to the plugin - it scans based on @source
    const result = await postcss([tailwindcss()]).process(css, {
      from: join(outputDir, "input.css"), // Set a from path for better resolution
    });
    signal.throwIfAborted();

    // Write the compiled CSS
    const outputPath = join(outputDir, "styles", "main.css");
    await fs.mkdir(join(outputDir, "styles"), { recursive: true });
    await fs.writeFile(outputPath, result.css, { encoding: "utf-8", signal });
    signal.throwIfAborted();

    logger.debug("Tailwind CSS processed successfully");
  }
}
