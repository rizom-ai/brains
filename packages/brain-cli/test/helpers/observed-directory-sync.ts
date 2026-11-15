import {
  createDirectorySyncPackage,
  type DirectorySync,
  type DirectorySyncService,
} from "@brains/directory-sync";
import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";

/**
 * A resolved brain's plugins with its directory-sync composed as the
 * canonical brain composes it, under the config the brain gives it, and a
 * handle on the sync it runs, which a load test drives directly.
 */
export function withObservedDirectorySync(
  plugins: readonly Plugin[],
  config: Record<string, unknown>,
): { plugins: Plugin[]; directorySync(): DirectorySync } {
  const held: { sync?: DirectorySyncService } = {};
  const [observed] = instantiatePluginPackageDefinition(
    createDirectorySyncPackage({
      onSetup: (state): void => {
        held.sync = state.sync;
      },
    }),
    config,
    { name: "@brains/directory-sync", version: "0.0.0-test" },
    { pluginId: "directory-sync" },
  );
  if (!observed) throw new Error("Directory sync installs no plugin");
  if (!plugins.some(({ id }) => id === "directory-sync"))
    throw new Error("The brain composes no directory-sync");
  return {
    plugins: plugins.map((plugin) =>
      plugin.id === "directory-sync" ? observed : plugin,
    ),
    directorySync: (): DirectorySync => {
      const directorySync = held.sync?.getDirectorySync();
      if (!directorySync) throw new Error("Directory sync was not initialized");
      return directorySync;
    },
  };
}
