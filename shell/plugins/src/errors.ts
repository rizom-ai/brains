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
