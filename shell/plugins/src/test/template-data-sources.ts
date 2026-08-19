import type { PluginTestHarness } from "./harness";

/**
 * Data source ids a package may legitimately point at without declaring:
 * the shell's own, registered before any package installs.
 */
const EXTERNAL_PREFIXES = ["shell:"];

/**
 * Every template a package registers must point at a data source that
 * exists once the package is installed.
 *
 * Worth its own check because the failure is silent and late. A template
 * carries its data source as a string, the registry looks it up by exact
 * match, and a miss only surfaces when something renders. Converting a
 * package to a declaration changes the scoped id — from `<pluginId>:<id>`
 * to `<packageName>:<id>` — so every reference written in the old form
 * keeps type-checking while resolving to nothing.
 *
 * Templates declare local ids; the runtime scopes them.
 */
export function expectTemplateDataSourcesResolve(
  harness: PluginTestHarness,
): void {
  const registered = new Set(harness.getDataSources().keys());
  const dangling = [...harness.getTemplates().entries()]
    .flatMap(([name, template]) => {
      const id = template.dataSourceId;
      if (id === undefined) return [];
      if (EXTERNAL_PREFIXES.some((prefix) => id.startsWith(prefix))) return [];
      return registered.has(id) ? [] : [`${name} -> ${id}`];
    })
    .sort();

  if (dangling.length > 0) {
    throw new Error(
      `Templates point at data sources that are not registered:\n  ${dangling.join(
        "\n  ",
      )}\nRegistered: ${[...registered].sort().join(", ") || "(none)"}`,
    );
  }
}
