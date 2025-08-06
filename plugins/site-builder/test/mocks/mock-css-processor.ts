import type { CSSProcessor } from "../../src/css/css-processor";
import type { Logger } from "@brains/plugins";
import { promises as fs } from "fs";

/**
 * Mock CSS processor for testing
 */
export class MockCSSProcessor implements CSSProcessor {
  async process(
    inputCSS: string,
    outputPath: string,
    _workingDir: string,
    _outputDir: string,
    logger: Logger,
  ): Promise<void> {
    logger.info("Using mock CSS processor");
    const fallbackCSS = `/* Mock CSS for testing */
${inputCSS}

/* Basic styles for testing */
.bg-white { background-color: white; }
.text-theme { color: #1a202c; }
.min-h-full { min-height: 100%; }
`;
    await fs.writeFile(outputPath, fallbackCSS, "utf-8");
  }
}
