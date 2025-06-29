import { BrainsError, type ErrorCause } from "@brains/utils";

/**
 * Plugin initialization errors
 */
export class PluginInitializationError extends BrainsError {
  public readonly pluginId: string;

  constructor(
    pluginId: string,
    cause: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Plugin ${pluginId}: Initialization failed`,
      "PLUGIN_INIT_FAILED",
      cause,
      { pluginId, ...context },
    );
    this.pluginId = pluginId;
  }
}