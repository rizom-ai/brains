import { BrainsError, type ErrorCause } from "@brains/utils";

/**
 * Base class for plugin-related errors
 */
export class PluginError extends BrainsError {
  public readonly pluginId: string;

  constructor(
    pluginId: string,
    message: string,
    code: string,
    cause: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(`Plugin ${pluginId}: ${message}`, code, cause, {
      pluginId,
      ...context,
    });
    this.pluginId = pluginId;
  }
}

/**
 * Plugin registration errors
 */
export class PluginRegistrationError extends PluginError {
  constructor(
    pluginId: string,
    reason: string,
    cause: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      pluginId,
      `Registration failed: ${reason}`,
      "PLUGIN_REGISTRATION_FAILED",
      cause,
      context,
    );
  }
}

/**
 * Plugin dependency resolution errors
 */
export class PluginDependencyError extends PluginError {
  constructor(
    pluginId: string,
    unmetDependencies: string[],
    cause: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      pluginId,
      `Unmet dependencies: ${unmetDependencies.join(", ")}`,
      "PLUGIN_DEPENDENCY_ERROR",
      cause,
      { unmetDependencies, ...context },
    );
  }
}

/**
 * Plugin initialization errors
 */
export class PluginInitializationError extends PluginError {
  constructor(
    pluginId: string,
    cause: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      pluginId,
      "Initialization failed",
      "PLUGIN_INIT_FAILED",
      cause,
      context,
    );
  }
}

/**
 * Plugin context errors - thrown when context is not available
 */
export class PluginContextError extends BrainsError {
  public readonly pluginId: string;

  constructor(
    pluginId: string,
    cause: ErrorCause = "Plugin context not initialized",
    context: Record<string, unknown> = {},
  ) {
    super(
      `Plugin ${pluginId}: Context not available`,
      "PLUGIN_CONTEXT_ERROR",
      cause,
      { pluginId, ...context },
    );
    this.pluginId = pluginId;
  }
}
