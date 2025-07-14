import type { Logger } from "@brains/utils";
import { join, relative } from "path";
import { promises as fs } from "fs";

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
 * Default Tailwind CSS processor
 */
export class TailwindCSSProcessor implements CSSProcessor {
  async process(
    inputCSS: string,
    _outputPath: string,
    workingDir: string,
    outputDir: string,
    logger: Logger,
  ): Promise<void> {
    // Create input file
    const inputPath = join(workingDir, "input.css");
    await fs.mkdir(workingDir, { recursive: true });
    await fs.writeFile(inputPath, inputCSS, "utf-8");

    // Use Tailwind CLI - this is the recommended approach for v4
    const { execSync } = await import("child_process");

    // Build the command - v4 has automatic content detection
    // Run from the output directory so Tailwind can find the HTML files
    const relativeInputPath = join("..", relative(outputDir, inputPath));
    const relativeOutputPath = "styles/main.css";
    const command = `bunx @tailwindcss/cli -i "${relativeInputPath}" -o "${relativeOutputPath}"`;

    logger.debug(`Running Tailwind CSS v4 from ${outputDir}`);
    logger.debug(`Command: ${command}`);

    try {
      execSync(command, {
        stdio: "pipe", // Capture output instead of inheriting
        cwd: outputDir, // Run from output directory
      });
    } catch (error) {
      logger.error("Tailwind CSS build failed", error);
      throw error;
    }

    // Clean up temp file
    await fs.unlink(inputPath).catch(() => {});
  }
}
