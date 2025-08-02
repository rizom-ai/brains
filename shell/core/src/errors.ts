/**
 * Shell-specific error classes
 */

/**
 * Shell initialization error
 */
export class ShellInitializationError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ShellInitializationError";
  }
}

/**
 * Service registration error
 */
export class ServiceRegistrationError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ServiceRegistrationError";
  }
}

/**
 * Plugin registration error
 */
export class PluginRegistrationError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PluginRegistrationError";
  }
}

/**
 * Database operation error
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}

/**
 * Template registration error
 */
export class TemplateRegistrationError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TemplateRegistrationError";
  }
}

/**
 * Entity registration error
 */
export class EntityRegistrationError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EntityRegistrationError";
  }
}

/**
 * General initialization error
 */
export class InitializationError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "InitializationError";
  }
}
