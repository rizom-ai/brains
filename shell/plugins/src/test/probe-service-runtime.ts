import { z } from "@brains/utils/zod";
import type { IShell, Plugin } from "../interfaces";
import { instantiatePluginPackageDefinition } from "../package-definition";
import { defineServicePlugin } from "../public/service-definition";
import {
  serviceRuntime,
  type ServiceRuntime,
} from "../service/service-runtime";

export interface ProbeServiceOptions {
  /** The service's id, and the plugin id it installs under. `probe` unless named. */
  id?: string;
  /** Its package name. `@brains/<id>` unless named. */
  packageName?: string;
  /** Register as a worker does, for execution only. */
  executionOnly?: boolean;
}

/**
 * A service that declares nothing, installed on a shell so a test can reach
 * the first-party runtime its setup is handed.
 */
export async function probeService(
  shell: IShell,
  options: ProbeServiceOptions = {},
): Promise<{ runtime: ServiceRuntime; plugin: Plugin }> {
  const id = options.id ?? "probe";
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id,
      config: z.object({}),
      setup: (context) => {
        runtime = serviceRuntime(context);
        return {};
      },
    }),
    {},
    { name: options.packageName ?? `@brains/${id}`, version: "0.1.0" },
    { pluginId: id },
  );
  if (!plugin) throw new Error("No plugin");
  await plugin.register(
    shell,
    options.executionOnly ? { executionOnly: true } : undefined,
  );
  if (!runtime) throw new Error("Setup did not run");
  return { runtime, plugin };
}

/** The first-party runtime of a service that declares nothing, on a shell. */
export async function probeRuntime(
  shell: IShell,
  options: ProbeServiceOptions = {},
): Promise<ServiceRuntime> {
  return (await probeService(shell, options)).runtime;
}
