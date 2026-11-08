import {
  EntityPlugin,
  instantiatePluginPackageDefinition,
  type BaseEntity,
} from "@brains/plugins";
import seriesPackage from "../src";

export type SeriesEntityPlugin = EntityPlugin<
  BaseEntity,
  Record<string, never>,
  Record<string, never>
>;

/** The entity plugin the series install, as the canonical brain composes it. */
export function seriesPlugin(): SeriesEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    seriesPackage,
    {},
    { name: "@brains/series", version: "0.0.0-test" },
    // Under the id its class had: series:series-list, series:entities.
    { pluginId: "series" },
  );
  if (!(plugin instanceof EntityPlugin)) {
    throw new Error("The series install no entity plugin");
  }
  return plugin;
}
