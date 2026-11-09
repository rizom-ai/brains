import type { Plugin } from "@brains/plugins";
import { CLIInterface } from "../src/cli-interface";
import type { CLIConfigInput } from "../src/config";

/**
 * The CLI interface as the brain creates it. The one place the tests name
 * how it is built, so they read the same before and after it is declared.
 */
export function createCliPlugin(config: CLIConfigInput = {}): Plugin {
  return new CLIInterface(config);
}
