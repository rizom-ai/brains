import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import siteInfoPackage from "../../src";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};

/**
 * The site-info package as the runtime builds it: a service plugin plus the
 * entity plugin for the type it declares.
 */
export function siteInfoPlugins(): Plugin[] {
  bindPluginPackageMetadata(siteInfoPackage, PACKAGE_METADATA);
  return instantiatePluginPackageDefinition(
    siteInfoPackage,
    {},
    PACKAGE_METADATA,
  );
}
