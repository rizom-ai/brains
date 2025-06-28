/**
 * Standardized error classes for the Shell package
 * Provides consistent error handling across all shell components
 */

/**
 * Base error class for all shell-related errors
 * Provides consistent structure and metadata
 */
export class ShellError extends Error {
  public readonly code: string;
  public readonly context: Record<string, unknown>;
  public override readonly cause: Error;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: string,
    cause: Error,
    context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.cause = cause;
    this.timestamp = new Date();

    // Preserve stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to structured object for logging/serialization
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      cause: this.cause?.message,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }
}

/**
 * Initialization-related errors
 */
export class InitializationError extends ShellError {
  constructor(
    component: string,
    cause: unknown,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Failed to initialize ${component}`,
      "INIT_FAILED",
      normalizeError(cause) || new Error("Unknown initialization error"),
      { component, ...context },
    );
  }
}

/**
 * Database-related errors
 */
export class DatabaseError extends ShellError {
  constructor(
    operation: string,
    cause: unknown,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Database operation failed: ${operation}`,
      "DB_ERROR",
      normalizeError(cause) || new Error("Unknown database error"),
      { operation, ...context },
    );
  }
}

/**
 * Configuration-related errors
 */
export class ConfigurationError extends ShellError {
  constructor(setting: string, cause: Error, value?: unknown) {
    super(`Invalid configuration: ${setting}`, "CONFIG_INVALID", cause, {
      setting,
      value,
    });
  }
}

/**
 * Base class for plugin-related errors
 */
export class PluginError extends ShellError {
  public readonly pluginId: string;

  constructor(
    pluginId: string,
    message: string,
    code: string,
    cause: Error,
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
    cause: Error,
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
    cause: Error,
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
    cause: Error,
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
export class ServiceError extends ShellError {
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
      normalizeError(cause) || new Error("Unknown service error"),
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
export class ContentGenerationError extends ShellError {
  constructor(
    templateName: string,
    operation: "generation" | "parsing",
    cause: Error,
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
 * Template registration errors
 */
export class TemplateRegistrationError extends ShellError {
  constructor(
    templateName: string,
    pluginId: string,
    cause: unknown,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Template registration failed: ${templateName}`,
      "TEMPLATE_REGISTRATION_FAILED",
      normalizeError(cause) || new Error("Unknown template registration error"),
      { templateName, pluginId, ...context },
    );
  }
}

/**
 * Route registration errors
 */
export class RouteRegistrationError extends ShellError {
  constructor(
    routeId: string,
    cause: Error,
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
export class McpError extends ShellError {
  constructor(
    operation: string,
    cause: Error,
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
    cause: Error,
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
    cause: Error,
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
 * Entity registration errors
 */
export class EntityRegistrationError extends ShellError {
  constructor(
    entityType: string,
    cause: unknown,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Entity type registration failed: ${entityType}`,
      "ENTITY_REGISTRATION_FAILED",
      normalizeError(cause) || new Error("Unknown entity registration error"),
      { entityType, ...context },
    );
  }
}

/**
 * Convert unknown error to Error instance
 */
function normalizeError(error: unknown): Error | undefined {
  if (!error) return undefined;
  if (error instanceof Error) return error;
  return new Error(String(error));
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
   * Check if error is of specific shell error type
   */
  static isShellError(error: unknown): error is ShellError {
    return error instanceof ShellError;
  }

  /**
   * Check if error is of specific plugin error type
   */
  static isPluginError(error: unknown): error is PluginError {
    return error instanceof PluginError;
  }

  /**
   * Wrap unknown error in ShellError if it's not already one
   */
  static wrapError(
    error: unknown,
    message: string,
    code: string,
    context: Record<string, unknown> = {},
  ): ShellError {
    if (error instanceof ShellError) {
      return error;
    }

    const cause = error instanceof Error ? error : new Error(String(error));
    return new ShellError(message, code, cause, context);
  }
}
