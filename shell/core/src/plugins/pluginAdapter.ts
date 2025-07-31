import type { Logger } from "@brains/utils";
import type { IShell } from "@brains/types";
import type { Plugin as OldPlugin } from "@brains/plugin-utils";
import type { Plugin as NewPlugin } from "@brains/plugin-base";
import type { PluginContextFactory } from "./pluginContextFactory";
import type { PluginRegistrationHandler } from "./pluginRegistrationHandler";
import { PluginRegistrationError } from "@brains/utils";

/**
 * Plugin type guard to ensure plugin has required properties
 */
function isValidPlugin(
  plugin: unknown,
): plugin is { id: string; register: (...args: unknown[]) => unknown } {
  return (
    typeof plugin === "object" &&
    plugin !== null &&
    "id" in plugin &&
    "register" in plugin &&
    typeof (plugin as Record<string, unknown>)["register"] === "function"
  );
}

/**
 * Register a plugin using the appropriate interface
 * Tries new interface first (IShell), falls back to old interface (PluginContext)
 */
export async function registerPluginWithAdapter(
  plugin: unknown,
  shell: IShell,
  contextFactory: PluginContextFactory,
  registrationHandler: PluginRegistrationHandler,
  logger: Logger,
): Promise<void> {
  // Validate plugin structure
  if (!isValidPlugin(plugin)) {
    throw new PluginRegistrationError(
      "unknown",
      "Invalid plugin structure - missing id or register method",
      "Plugin validation failed",
    );
  }

  const pluginId = plugin.id;
  logger.debug(`Attempting to register plugin: ${pluginId}`);

  try {
    // Try new interface first (IShell)
    const newPlugin = plugin as NewPlugin;
    const capabilities = await newPlugin.register(shell);

    // If successful, it's using the new interface
    logger.debug(`Plugin ${pluginId} using new IShell interface`);

    // Register capabilities directly through the handler
    await registrationHandler.registerPluginCapabilities(
      pluginId,
      capabilities,
    );
  } catch {
    // Fall back to old interface (PluginContext)
    logger.info(
      `Plugin ${pluginId} still using old PluginContext interface - needs migration`,
    );

    try {
      // Create context for old plugin
      const context = contextFactory.createPluginContext(pluginId);

      // Cast to OldPlugin for type safety
      const oldPlugin = plugin as OldPlugin;
      const capabilities = await oldPlugin.register(context);

      // Old plugins return capabilities that need to be registered
      // The context handles tools and resources, but we need to handle commands
      if (
        capabilities &&
        capabilities.commands &&
        capabilities.commands.length > 0
      ) {
        await registrationHandler.registerPluginCapabilities(
          pluginId,
          capabilities,
        );
      }

      logger.debug(
        `Plugin ${pluginId} registered successfully using old interface`,
      );
    } catch (contextError) {
      // If both interfaces fail, throw the original error
      logger.error(
        `Failed to register plugin ${pluginId} with either interface`,
        contextError,
      );
      throw new PluginRegistrationError(
        pluginId,
        `Plugin registration failed: ${contextError instanceof Error ? contextError.message : String(contextError)}`,
        "Registration failed with both interfaces",
      );
    }
  }

  logger.info(`Successfully registered plugin: ${pluginId}`);
}
