import type { Plugin } from "@brains/plugins";
import { adminPlugin } from "../src";

/** The admin service plugin, as the canonical brain composes it. */
export function createAdminPlugin(
  config: Record<string, unknown> = {},
): Plugin {
  return adminPlugin(config);
}
