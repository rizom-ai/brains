/**
 * View Registry specific error classes
 * Domain-specific errors for view registry operations
 */

/**
 * Template not found error
 */
export class TemplateNotFoundError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TemplateNotFoundError";
  }
}

/**
 * Route validation error
 */
export class RouteValidationError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RouteValidationError";
  }
}

/**
 * Renderer error
 */
export class RendererError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RendererError";
  }
}

/**
 * View configuration error
 */
export class ViewConfigError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ViewConfigError";
  }
}

/**
 * Route not found error
 */
export class RouteNotFoundError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RouteNotFoundError";
  }
}

/**
 * Template registration error
 */
export class ViewTemplateRegistrationError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ViewTemplateRegistrationError";
  }
}

/**
 * Route registration error
 */
export class ViewRouteRegistrationError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ViewRouteRegistrationError";
  }
}
