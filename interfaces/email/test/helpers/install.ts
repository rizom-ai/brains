import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import {
  emailInterface,
  type EmailConfigInput,
  type EmailInterfaceDependencies,
  type EmailInterfacePackage,
} from "../../src";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};

/**
 * The email interface, as the runtime would build it.
 *
 * Tests used to construct EmailInterface directly and pass fakes to its
 * constructor. A declaration has no constructor, so the package exports a
 * factory that closes over them instead.
 */
/** The id the runtime assigns: the declaration id, scoped by package. */
export const EMAIL_PLUGIN_ID: string = `${packageJson.name}:email`;

export function emailPlugin(
  config: EmailConfigInput = {},
  dependencies: EmailInterfaceDependencies = {},
): Plugin {
  const definition: EmailInterfacePackage = emailInterface(dependencies);
  bindPluginPackageMetadata(definition, PACKAGE_METADATA);
  const plugin = instantiatePluginPackageDefinition(
    definition,
    config,
    PACKAGE_METADATA,
  )[0];
  if (!plugin) throw new Error("Email interface plugin was not created");
  return plugin;
}
