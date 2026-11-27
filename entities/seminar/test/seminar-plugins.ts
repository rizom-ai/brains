import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import { seminarPackage } from "../src";
import packageJson from "../package.json";

/**
 * The seminar package's plugins, as the canonical brain installs them: the
 * service under seminar, its type apart.
 */
export function createSeminarPlugins(): Plugin[] {
  return instantiatePluginPackageDefinition(
    seminarPackage,
    {},
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "seminar", ownedTypePluginId: "seminar-entity" },
  );
}
