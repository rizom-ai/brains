import {
  bindPluginPackageMetadata,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type Plugin,
  type PluginRegistrationContext,
} from "@brains/plugins";
import type { MockShell } from "@brains/plugins/test";
import type { AnySubscriptionDefinition } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  directorySyncService,
  type DirectorySyncDeps,
  type DirectorySyncHost,
  type DirectorySyncState,
} from "../../src";
import type { DirectorySyncConfigInput } from "../../src/types";
import {
  coverImageConvertJob,
  directoryCleanupJob,
  directoryDeleteJob,
  directoryExportJob,
  directoryImportJob,
  directorySyncJob,
  inlineImageConvertJob,
  syncRequestJob,
} from "../../src/jobs";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};
export const DIRECTORY_SYNC_PLUGIN_ID: string = `${packageJson.name}:directory-sync`;
/**
 * The runtime files a declared package's state under its package name, so
 * a test seeding what a previous run left writes where the package reads.
 */
export function scopedStateNamespace(namespace: string): string {
  return `brains.directory-sync.${namespace}`;
}

/** The one tool, as the runtime names it. */
export const SYNC_TOOL = "directory-sync_sync";

export interface InstantiatedDirectorySync {
  readonly plugin: Plugin;
  /** What setup built, once it has run. */
  readonly state: () => DirectorySyncState;
}

/** The plugin the runtime builds from one config, and the state setup built. */
export function instantiate(
  config: DirectorySyncConfigInput = {},
  deps: DirectorySyncDeps = {},
): InstantiatedDirectorySync {
  let captured: DirectorySyncState | undefined;
  const definition = directorySyncService({
    ...deps,
    onState: (state): void => {
      captured = state;
      deps.onState?.(state);
    },
  });
  bindPluginPackageMetadata(definition, PACKAGE_METADATA);
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    config,
    PACKAGE_METADATA,
  );
  if (!plugin) throw new Error("Directory sync plugin was not created");
  return {
    plugin,
    state: (): DirectorySyncState => {
      if (!captured) throw new Error("Directory sync was not set up");
      return captured;
    },
  };
}

const notRun = async (): Promise<never> => {
  throw new Error("Jobs do not run in this test");
};

/**
 * The host directory-sync's modules run on, as the declared runtime hands it
 * over. Built by installing a fixture that declares the same jobs on the
 * shell, so a module under test files real jobs on the shell's queue and
 * reads the records through the real mirror — never a hand-made fake of
 * either.
 */
export async function hostFor(
  shell: MockShell,
  options: { readonly role?: "scheduler" | "worker" | undefined } = {},
): Promise<DirectorySyncHost> {
  let captured: DirectorySyncHost | undefined;
  const definition = defineServicePlugin(
    {
      id: "directory-sync",
      config: z.object({}),
      setup: ({
        entityMirror,
        jobs,
        messaging,
        state,
        logger,
        dataDir,
        role,
        gitBroker,
      }) => {
        captured = {
          mirror: entityMirror,
          jobs,
          messaging,
          state,
          logger,
          dataDir,
          role,
          gitBroker,
        };
        return {};
      },
    },
    {
      jobs: () => [
        directorySyncJob.handle(notRun),
        syncRequestJob.handle(notRun),
        directoryImportJob.handle(notRun),
        directoryExportJob.handle(notRun),
        directoryDeleteJob.handle(notRun),
        directoryCleanupJob.handle(notRun),
        coverImageConvertJob.handle(notRun),
        inlineImageConvertJob.handle(notRun),
      ],
    },
  );
  bindPluginPackageMetadata(definition, PACKAGE_METADATA);
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    PACKAGE_METADATA,
  );
  if (!plugin) throw new Error("Directory sync host fixture was not created");
  const registration: PluginRegistrationContext | undefined =
    options.role === "worker" ? { executionOnly: true } : undefined;
  await plugin.register(shell, registration);
  if (!captured) throw new Error("The host fixture did not set up");
  return captured;
}

/**
 * Declared subscriptions bound to a shell's bus, the way the runtime binds
 * them: a fixture service declaring exactly these is installed, so a test
 * sends the messages other packages send and reads the runtime's envelope.
 */
export async function installSubscriptions(
  shell: MockShell,
  subscriptions: readonly AnySubscriptionDefinition[],
): Promise<Plugin> {
  const definition = defineServicePlugin(
    {
      id: "directory-sync",
      config: z.object({}),
    },
    {
      subscriptions: () => subscriptions,
    },
  );
  bindPluginPackageMetadata(definition, PACKAGE_METADATA);
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    PACKAGE_METADATA,
  );
  if (!plugin) throw new Error("Subscription fixture was not created");
  await plugin.register(shell);
  return plugin;
}
