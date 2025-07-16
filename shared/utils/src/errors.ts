/**
 * Standardized error utilities for the Brains ecosystem
 * Provides consistent error handling patterns across all packages
 */

/**
 * Utility type for error causes that can be a string, Error instance, or unknown (from catch blocks)
 */
export type ErrorCause = string | Error;

/**
 * Base error class for all Brains-related errors
 * Provides consistent structure and metadata
 */
export class BrainsError extends Error {
  public readonly code: string;
  public readonly context: Record<string, unknown>;
  public override readonly cause: Error;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: string,
    cause: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.cause = normalizeError(cause);
    this.timestamp = new Date();
  }

  /**
   * Convert error to structured object for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      cause: this.cause.message,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }
}

/**
 * Initialization-related errors
 */
export class InitializationError extends BrainsError {
  constructor(
    component: string,
    cause: unknown,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Failed to initialize ${component}`,
      "INIT_FAILED",
      normalizeError(cause),
      { component, ...context },
    );
  }
}

/**
 * Database-related errors
 */
export class DatabaseError extends BrainsError {
  constructor(
    operation: string,
    cause: unknown,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Database operation failed: ${operation}`,
      "DB_ERROR",
      normalizeError(cause),
      { operation, ...context },
    );
  }
}

/**
 * Configuration-related errors
 */
export class ConfigurationError extends BrainsError {
  constructor(setting: string, cause: ErrorCause, value?: unknown) {
    super(`Invalid configuration: ${setting}`, "CONFIG_INVALID", cause, {
      setting,
      value,
    });
  }
}

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
 * Service-related errors
 */
export class ServiceError extends BrainsError {
  public readonly serviceName: string;

  constructor(
    serviceName: string,
    operation: string,
    cause: unknown,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Service ${serviceName}: ${operation} failed`,
      "SERVICE_ERROR",
      normalizeError(cause),
      { serviceName, operation, ...context },
    );
    this.serviceName = serviceName;
  }
}

/**
 * Service registration errors
 */
export class ServiceRegistrationError extends ServiceError {
  constructor(
    serviceName: string,
    cause: Error,
    context: Record<string, unknown> = {},
  ) {
    super(serviceName, "registration", cause, {
      code: "SERVICE_REGISTRATION_FAILED",
      ...context,
    });
  }
}

/**
 * Service resolution errors
 */
export class ServiceResolutionError extends ServiceError {
  constructor(
    serviceName: string,
    cause: Error,
    context: Record<string, unknown> = {},
  ) {
    super(serviceName, "resolution", cause, {
      code: "SERVICE_RESOLUTION_FAILED",
      ...context,
    });
  }
}

/**
 * Content generation errors
 */
export class ContentGenerationError extends BrainsError {
  constructor(
    templateName: string,
    operation: "generation" | "parsing" | "formatting",
    cause: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Content ${operation} failed for template: ${templateName}`,
      `CONTENT_${operation.toUpperCase()}_FAILED`,
      cause,
      { templateName, operation, ...context },
    );
  }
}

/**
 * Error for templates that don't support AI content generation
 */
export class TemplateNotGeneratableError extends BrainsError {
  constructor(
    templateName: string,
    reason: string = "Template does not support AI content generation",
    context: Record<string, unknown> = {},
  ) {
    super(
      `Template ${templateName} does not support AI content generation`,
      "TEMPLATE_NOT_GENERATABLE",
      reason,
      { templateName, ...context },
    );
    this.name = "TemplateNotGeneratableError";
  }
}

/**
 * Template registration errors
 */
export class TemplateRegistrationError extends BrainsError {
  constructor(
    templateName: string,
    pluginId: string,
    cause: unknown,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Template registration failed: ${templateName}`,
      "TEMPLATE_REGISTRATION_FAILED",
      normalizeError(cause),
      { templateName, pluginId, ...context },
    );
  }
}

/**
 * Route registration errors
 */
export class RouteRegistrationError extends BrainsError {
  constructor(
    routeId: string,
    cause: ErrorCause,
    pluginId?: string,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Route registration failed: ${routeId}`,
      "ROUTE_REGISTRATION_FAILED",
      cause,
      { routeId, pluginId, ...context },
    );
  }
}

/**
 * MCP-related errors
 */
export class McpError extends BrainsError {
  constructor(
    operation: string,
    cause: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(`MCP operation failed: ${operation}`, "MCP_ERROR", cause, {
      operation,
      ...context,
    });
  }
}

/**
 * Tool registration errors
 */
export class ToolRegistrationError extends McpError {
  constructor(
    toolName: string,
    cause: ErrorCause,
    pluginId?: string,
    context: Record<string, unknown> = {},
  ) {
    super(`tool registration (${toolName})`, cause, {
      toolName,
      pluginId,
      code: "TOOL_REGISTRATION_FAILED",
      ...context,
    });
  }
}

/**
 * Resource registration errors
 */
export class ResourceRegistrationError extends McpError {
  constructor(
    resourceName: string,
    cause: ErrorCause,
    pluginId?: string,
    context: Record<string, unknown> = {},
  ) {
    super(`resource registration (${resourceName})`, cause, {
      resourceName,
      pluginId,
      code: "RESOURCE_REGISTRATION_FAILED",
      ...context,
    });
  }
}

/**
 * Job handler registration errors
 */
export class JobHandlerRegistrationError extends BrainsError {
  constructor(
    handlerType: string,
    pluginId: string,
    cause: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Job handler registration failed: ${handlerType}`,
      "JOB_HANDLER_REGISTRATION_FAILED",
      cause,
      { handlerType, pluginId, ...context },
    );
  }
}

/**
 * Daemon registration errors
 */
export class DaemonRegistrationError extends BrainsError {
  constructor(
    daemonName: string,
    pluginId: string,
    cause: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Daemon registration failed: ${daemonName}`,
      "DAEMON_REGISTRATION_FAILED",
      cause,
      { daemonName, pluginId, ...context },
    );
  }
}

/**
 * Job operation errors
 */
export class JobOperationError extends BrainsError {
  constructor(
    operation: string,
    cause: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Job operation failed: ${operation}`,
      "JOB_OPERATION_FAILED",
      cause,
      { operation, ...context },
    );
  }
}

/**
 * Entity registration errors
 */
export class EntityRegistrationError extends BrainsError {
  constructor(
    entityType: string,
    cause: unknown,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Entity type registration failed: ${entityType}`,
      "ENTITY_REGISTRATION_FAILED",
      normalizeError(cause),
      { entityType, ...context },
    );
  }
}

/**
 * Convert ErrorCause to Error instance
 */
function normalizeError(cause: ErrorCause): Error {
  if (typeof cause === "string") return new Error(cause);
  if (cause instanceof Error) return cause;
  return new Error(String(cause));
}

/**
 * Utility functions for error handling
 */
export class ErrorUtils {
  /**
   * Safely extract error message from unknown error
   */
  static getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  /**
   * Check if error is of specific Brains error type
   */
  static isBrainsError(error: unknown): error is BrainsError {
    return error instanceof BrainsError;
  }

  /**
   * Check if error is of specific plugin error type
   */
  static isPluginError(error: unknown): error is PluginError {
    return error instanceof PluginError;
  }

  /**
   * Wrap unknown error in BrainsError if it's not already one
   */
  static wrapError(
    error: unknown,
    message: string,
    code: string,
    context: Record<string, unknown> = {},
  ): BrainsError {
    if (error instanceof BrainsError) {
      return error;
    }

    const cause = error instanceof Error ? error : new Error(String(error));
    return new BrainsError(message, code, cause, context);
  }

  /**
   * Execute a synchronous operation with standardized error handling and logging
   */
  static withLogging<T>(
    operation: () => T,
    errorMessage: string,
    logger: { error: (message: string, error?: unknown) => void },
    errorClass: new (...args: unknown[]) => Error,
    ...errorArgs: unknown[]
  ): T {
    try {
      return operation();
    } catch (error) {
      logger.error(errorMessage, error);
      throw new errorClass(...errorArgs, error);
    }
  }

  /**
   * Execute an asynchronous operation with standardized error handling and logging
   */
  static async withLoggingAsync<T>(
    operation: () => Promise<T>,
    errorMessage: string,
    logger: { error: (message: string, error?: unknown) => void },
    errorClass: new (...args: unknown[]) => Error,
    ...errorArgs: unknown[]
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      logger.error(errorMessage, error);
      throw new errorClass(...errorArgs, error);
    }
  }
}

// Re-export normalizeError for external use
export { normalizeError };
