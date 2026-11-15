import {
  SYSTEM_CHANNELS,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import type { MockShell } from "@brains/plugins/test";
import { defineServicePlugin, z } from "@brains/sdk/services";
import {
  serviceRuntime,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";

/**
 * The runtime a first-party service reaches on a test shell, under the
 * content-pipeline plugin id, for a test of one part of the pipeline the
 * package builds on it: its Studio, its Dashboard widget, its bus.
 */
export async function pipelineRuntime(
  shell: MockShell,
): Promise<ServiceRuntime> {
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id: "content-pipeline",
      config: z.object({}),
      setup: (context) => {
        runtime = serviceRuntime(context);
        return {};
      },
    }),
    {},
    { name: "@brains/content-pipeline", version: "0.0.0-test" },
    { pluginId: "content-pipeline" },
  );
  if (!plugin) throw new Error("No probe plugin");
  await plugin.register(shell);
  if (!runtime) throw new Error("The probe did not set up");
  return runtime;
}

/** Announce that every plugin registered, as the shell does once. */
export async function pluginsRegistered(shell: MockShell): Promise<void> {
  await shell.getMessageBus().send({
    type: SYSTEM_CHANNELS.pluginsRegistered,
    payload: {},
    sender: "shell",
    broadcast: true,
  });
}
