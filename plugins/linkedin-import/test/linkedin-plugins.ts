import type { Plugin } from "@brains/plugins";
import { linkedInImportPlugin, type LinkedInImportDeps } from "../src";

/** The LinkedIn import's plugins, as the canonical brain installs them. */
export function createLinkedInImportPlugins(
  config: Record<string, unknown> = {},
  deps: LinkedInImportDeps = {},
): Plugin[] {
  return [linkedInImportPlugin(config, deps)];
}
