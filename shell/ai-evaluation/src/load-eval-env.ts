import { join } from "path";
import { config as dotenvConfig } from "dotenv";

/**
 * Load the eval .env file from the ai-evaluation package directory.
 *
 * This is the single source for eval secrets (API keys).
 * Call this at the top of any eval entry point (runner, build script, etc.).
 */
export function loadEvalEnv(): void {
  // import.meta.dir resolves to shell/ai-evaluation/src/
  dotenvConfig({ path: join(import.meta.dir, "..", ".env") });
}
