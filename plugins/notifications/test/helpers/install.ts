import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import notificationsPackage from "../../src";
import type { NotificationsConfigInput } from "../../src";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};

/**
 * The notifications service, as the runtime would build it.
 *
 * Tests used to construct NotificationsPlugin directly; the package declares
 * itself now, so they go through instantiation instead.
 */
export function notificationsPlugin(
  config: NotificationsConfigInput = {},
): Plugin {
  bindPluginPackageMetadata(notificationsPackage, PACKAGE_METADATA);
  const plugin = instantiatePluginPackageDefinition(
    notificationsPackage,
    config,
    PACKAGE_METADATA,
  )[0];
  if (!plugin) throw new Error("Notifications plugin was not created");
  return plugin;
}
