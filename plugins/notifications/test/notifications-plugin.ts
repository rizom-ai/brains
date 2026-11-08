import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import notificationsPackage, { type NotificationsConfigInput } from "../src";

/** The notifications service plugin, as the canonical brain composes it. */
export function notificationsPlugin(
  config: NotificationsConfigInput = {},
): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    notificationsPackage,
    config,
    { name: "@brains/notifications", version: "0.0.0-test" },
    // Under the id its class had.
    { pluginId: "notifications" },
  );
  if (!plugin) throw new Error("Notifications installs no plugin");
  return plugin;
}
