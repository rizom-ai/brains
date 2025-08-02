/**
 * Base class for plugin-related errors
 */
export class PluginError extends Error {
  public readonly pluginId: string;

  constructor(
    pluginId: string,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(`Plugin ${pluginId}: ${message}`);
    this.name = "PluginError";
    this.pluginId = pluginId;
  }
}

/**
 * Plugin registration errors
 */
export class PluginRegistrationError extends PluginError {
  constructor(
    pluginId: string,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(pluginId, `Registration failed: ${message}`, context);
    this.name = "PluginRegistrationError";
  }
}

/**
 * Plugin dependency resolution errors
 */
export class PluginDependencyError extends PluginError {
  constructor(
    pluginId: string,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(pluginId, message, context);
    this.name = "PluginDependencyError";
  }
}

/**
 * Plugin initialization errors
 */
export class PluginInitializationError extends PluginError {
  constructor(
    pluginId: string,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(pluginId, `Initialization failed: ${message}`, context);
    this.name = "PluginInitializationError";
  }
}

/**
 * Plugin context errors - thrown when context is not available
 */
export class PluginContextError extends Error {
  public readonly pluginId: string;

  constructor(
    pluginId: string,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(`Plugin ${pluginId}: ${message}`);
    this.name = "PluginContextError";
    this.pluginId = pluginId;
  }
}