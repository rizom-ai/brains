import { actionBoardPackage } from "@brains/action-board";
import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";

/**
 * The action board's plugins, as the canonical brain installs them: under
 * the action-board class's plugin id.
 */
export function createActionBoardPlugins(): Plugin[] {
  return instantiatePluginPackageDefinition(
    actionBoardPackage,
    {},
    { name: "@brains/action-board", version: "0.0.0-test" },
    { pluginId: "action-board" },
  );
}
