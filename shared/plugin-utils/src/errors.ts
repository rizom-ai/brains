/**
 * Plugin initialization errors
 */
export class PluginInitializationError extends Error {
  public readonly pluginId: string;

  constructor(
    pluginId: string,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PluginInitializationError";
    this.pluginId = pluginId;
  }
}
