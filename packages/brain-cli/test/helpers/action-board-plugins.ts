import { actionBoardPlugin } from "@brains/action-board";
import type { Plugin } from "@brains/plugins";

/** The action board's plugins, as the canonical brain installs them. */
export function createActionBoardPlugins(): Plugin[] {
  return [actionBoardPlugin()];
}
