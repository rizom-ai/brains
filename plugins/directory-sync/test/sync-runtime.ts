import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type ServiceRuntime,
} from "@brains/plugins";
import type { MockShell } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import type {
  DirectorySyncContext,
  DirectorySyncCore,
} from "../src/lib/sync-context";

/**
 * The runtime a first-party service reaches on a test shell, under the
 * directory-sync plugin id, for a test of one part of directory-sync that
 * registers on the bus, Studio or the shell's health.
 */
export async function directorySyncRuntime(
  shell: MockShell,
  options: { executionOnly?: boolean } = {},
): Promise<ServiceRuntime> {
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id: "directory-sync",
      config: z.object({}),
      setup: (context) => {
        runtime = serviceRuntime(context);
        return {};
      },
    }),
    {},
    { name: "@brains/directory-sync", version: "0.0.0-test" },
    { pluginId: "directory-sync" },
  );
  if (!plugin) throw new Error("No probe plugin");
  await plugin.register(
    shell,
    options.executionOnly ? { executionOnly: true } : undefined,
  );
  if (!runtime) throw new Error("The probe did not set up");
  return runtime;
}

/**
 * A test's context for directory-sync: what it reads, writes and queues
 * through (a class context the test shapes), on a runtime that registers
 * on the same shell.
 */
export async function syncContextOn<TCore extends DirectorySyncCore>(
  shell: MockShell,
  core: TCore,
): Promise<TCore & Pick<DirectorySyncContext, "runtime">> {
  return Object.assign(core, { runtime: await directorySyncRuntime(shell) });
}
