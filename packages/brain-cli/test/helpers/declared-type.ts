import {
  EntityPlugin,
  instantiatePluginPackageDefinition,
  type BaseEntity,
  type EntityAdapter,
  type PluginPackageDefinition,
} from "@brains/plugins";

/**
 * A first-party declared type's schema and adapter, as the canonical brain
 * installs it, for a test that registers types on a registry of its own.
 */
export function declaredType(
  definition: PluginPackageDefinition,
  packageName: string,
  pluginId: string,
): {
  schema: EntityPlugin<BaseEntity, unknown, unknown>["schema"];
  adapter: EntityAdapter<BaseEntity>;
} {
  const plugin = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: packageName, version: "0.0.0-test" },
    { pluginId },
  ).find((candidate) => candidate instanceof EntityPlugin);
  if (!(plugin instanceof EntityPlugin)) {
    throw new Error(`${packageName} installs no entity plugin`);
  }
  return { schema: plugin.schema, adapter: plugin.adapter };
}
