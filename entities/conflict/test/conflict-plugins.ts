import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import {
  isDeclaredEntityType,
  type DeclaredEntityTypePlugin,
} from "@brains/plugins/test";
import conflictPackage from "../src";
import packageJson from "../package.json";

/**
 * The conflict package's plugins, as the canonical brain installs them: the
 * conflict type and, apart from it, the service that keeps conflicts.
 */
export function createConflictPlugins(): Plugin[] {
  return instantiatePluginPackageDefinition(
    conflictPackage,
    {},
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "conflicts" },
  );
}

/** A conflict type as the installed package declares it. */
export function conflictType(
  entityType: "conflict" | "conflict-image" = "conflict",
): DeclaredEntityTypePlugin {
  const plugin = createConflictPlugins().find(
    (candidate): candidate is DeclaredEntityTypePlugin =>
      isDeclaredEntityType(candidate) && candidate.entityType === entityType,
  );
  if (!plugin)
    throw new Error(`The conflict package declares no ${entityType}`);
  return plugin;
}
