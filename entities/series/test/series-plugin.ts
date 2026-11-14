import { instantiatePluginPackageDefinition } from "@brains/plugins";
import seriesPackage from "../src";
import {
  isDeclaredEntityType,
  type DeclaredEntityTypePlugin,
} from "@brains/plugins/test";

export type SeriesEntityPlugin = DeclaredEntityTypePlugin;

/** The entity plugin the series install, as the canonical brain composes it. */
export function seriesPlugin(): SeriesEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    seriesPackage,
    {},
    { name: "@brains/series", version: "0.0.0-test" },
    // Under the id its class had: series:series-list, series:entities.
    { pluginId: "series" },
  );
  if (!isDeclaredEntityType(plugin)) {
    throw new Error("The series install no entity plugin");
  }
  return plugin;
}
