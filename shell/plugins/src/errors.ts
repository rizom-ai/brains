/**
 * Plugin error class with plugin ID tracking
 */
export class PluginError extends Error {
  public readonly pluginId: string;

  constructor(pluginId: string, message: string) {
    super(`Plugin ${pluginId}: ${message}`);
    this.name = "PluginError";
    this.pluginId = pluginId;
  }
}

/**
 * A plugin configuration this brain must not run with. The shell fails the
 * boot on it, whether or not the plugin's daemon is required.
 */
export class FatalPluginConfigurationError extends Error {
  public readonly pluginId: string;

  constructor(pluginId: string, message: string) {
    super(message);
    this.name = "FatalPluginConfigurationError";
    this.pluginId = pluginId;
  }
}
