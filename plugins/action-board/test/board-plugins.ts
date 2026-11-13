import type { Plugin } from "@brains/plugins";
import { actionBoardPlugin } from "../src";

/** The action board's plugins, as the canonical brain installs them. */
export function createActionBoardPlugins(
  config: Record<string, unknown> = {},
): Plugin[] {
  return [actionBoardPlugin(config)];
}
