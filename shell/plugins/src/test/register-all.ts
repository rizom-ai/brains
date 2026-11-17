import type { IShell, Plugin, PluginCapabilities } from "../interfaces";

/**
 * Registers each plugin of a package on a shell, in order, and hands back
 * what each registered: as a worker does, for execution only, when asked.
 */
export async function registerAll(
  shell: IShell,
  plugins: readonly Plugin[],
  options: { executionOnly?: boolean | undefined } = {},
): Promise<PluginCapabilities[]> {
  const capabilities: PluginCapabilities[] = [];
  for (const plugin of plugins) {
    capabilities.push(
      await plugin.register(
        shell,
        options.executionOnly ? { executionOnly: true } : undefined,
      ),
    );
  }
  return capabilities;
}
