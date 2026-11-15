import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import type { DirectorySync } from "../src/lib/directory-sync";
import { createDirectorySyncPackage } from "../src/plugin";
import type { DirectorySyncService } from "../src/service";
import type { DirectorySyncConfigInput } from "../src/types";
import packageJson from "../package.json";

const metadata = { name: packageJson.name, version: packageJson.version };

/**
 * The directory-sync service as a test drives it: the plugin the canonical
 * brain composes, with its lifecycle, and the running sync its class
 * exposed (`getDirectorySync`, `configure`, `hasGitSync`).
 */
export type DirectorySyncPlugin = Plugin & {
  ready(): Promise<void>;
  shutdown(): Promise<void>;
  getDirectorySync(): DirectorySync | undefined;
  configure(options: { syncPath: string }): Promise<void>;
  hasGitSync(): boolean;
};

/** The directory-sync service, as the canonical brain composes it. */
export function createDirectorySyncPlugin(
  config: DirectorySyncConfigInput = {},
): DirectorySyncPlugin {
  const held: { sync?: DirectorySyncService } = {};
  const [plugin] = instantiatePluginPackageDefinition(
    createDirectorySyncPackage({
      onSetup: (state): void => {
        held.sync = state.sync;
      },
    }),
    config,
    metadata,
    { pluginId: "directory-sync" },
  );
  if (!plugin?.ready || !plugin.shutdown)
    throw new Error("The package installs no service plugin");
  const { ready, shutdown } = plugin;
  const sync = (): DirectorySyncService => {
    if (!held.sync) throw new Error("Directory sync is not set up");
    return held.sync;
  };
  return Object.assign(plugin, {
    ready: (): Promise<void> => ready.call(plugin),
    shutdown: (): Promise<void> => shutdown.call(plugin),
    getDirectorySync: (): DirectorySync | undefined =>
      held.sync?.getDirectorySync(),
    configure: (options: { syncPath: string }): Promise<void> =>
      sync().configure(options),
    hasGitSync: (): boolean => held.sync?.hasGitSync() ?? false,
  });
}

/** The directory-sync package's plugins, as a brain installs them. */
export function createDirectorySyncPlugins(
  config: DirectorySyncConfigInput = {},
): Plugin[] {
  return [createDirectorySyncPlugin(config)];
}
